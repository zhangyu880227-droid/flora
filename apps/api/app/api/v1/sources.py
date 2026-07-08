import uuid
from typing import Annotated

from fastapi import APIRouter, File, Form, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DB
from app.models.project import Project
from app.models.source import Source, SourceChunk, SourceStatus, SourceType
from app.models.workspace import WorkspaceMember
from app.schemas.source import SourceCreate, SourceResponse
from app.services.storage import storage
from app.tasks.ingestion import ingest_source

router = APIRouter()


@router.get("/projects/{project_id}/sources", response_model=list[SourceResponse])
async def list_sources(project_id: uuid.UUID, current_user: CurrentUser, db: DB) -> list:
    project = await _get_project_or_403(project_id, current_user.id, db)
    result = await db.execute(
        select(Source).where(Source.project_id == project_id).order_by(Source.created_at.desc())
    )
    sources = result.scalars().all()
    return [await _enrich(s, db) for s in sources]


@router.post("/projects/{project_id}/sources", response_model=SourceResponse, status_code=status.HTTP_201_CREATED)
async def create_source(
    project_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    type: Annotated[str, Form()],
    url: Annotated[str | None, Form()] = None,
    title: Annotated[str | None, Form()] = None,
    file: Annotated[UploadFile | None, File()] = None,
) -> SourceResponse:
    project = await _get_project_or_403(project_id, current_user.id, db)
    source_type = SourceType(type)

    source = Source(
        project_id=project_id,
        type=source_type,
        title=title or url or "Untitled",
        url=url,
        created_by=current_user.id,
        status=SourceStatus.pending,
    )
    db.add(source)
    await db.flush()

    if file and source_type == SourceType.pdf:
        content = await file.read()
        file_path = storage.save(project.workspace_id, source.id, file.filename or "upload.pdf", content)
        source.file_path = file_path

    await db.commit()
    await db.refresh(source)

    ingest_source.delay(str(source.id))

    return await _enrich(source, db)


@router.get("/sources/{source_id}", response_model=SourceResponse)
async def get_source(source_id: uuid.UUID, current_user: CurrentUser, db: DB) -> SourceResponse:
    source = await _get_source_or_403(source_id, current_user.id, db)
    return await _enrich(source, db)


@router.delete("/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_source(source_id: uuid.UUID, current_user: CurrentUser, db: DB) -> None:
    source = await _get_source_or_403(source_id, current_user.id, db)
    if source.file_path:
        storage.delete(source.file_path)
    await db.delete(source)


@router.post("/sources/{source_id}/reprocess", response_model=SourceResponse)
async def reprocess_source(source_id: uuid.UUID, current_user: CurrentUser, db: DB) -> SourceResponse:
    source = await _get_source_or_403(source_id, current_user.id, db)
    source.status = SourceStatus.pending
    source.error_message = None
    await db.commit()
    ingest_source.delay(str(source.id))
    return await _enrich(source, db)


@router.get("/sources/{source_id}/status")
async def source_status_stream(source_id: uuid.UUID, current_user: CurrentUser, db: DB) -> StreamingResponse:
    source = await _get_source_or_403(source_id, current_user.id, db)

    async def event_generator():
        import asyncio
        from app.db.session import AsyncSessionLocal

        async with AsyncSessionLocal() as poll_db:
            for _ in range(120):  # poll up to 2 minutes
                result = await poll_db.execute(select(Source).where(Source.id == source_id))
                s = result.scalar_one_or_none()
                if not s:
                    yield f"data: {{\"status\": \"not_found\"}}\n\n"
                    return
                yield f"data: {{\"status\": \"{s.status.value}\"}}\n\n"
                if s.status in (SourceStatus.ready, SourceStatus.error):
                    return
                await asyncio.sleep(1)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


async def _get_project_or_403(project_id: uuid.UUID, user_id: uuid.UUID, db: DB) -> Project:
    result = await db.execute(
        select(Project)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Project.workspace_id)
        .where(Project.id == project_id, WorkspaceMember.user_id == user_id)
    )
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=403, detail="Project not found or access denied")
    return project


async def _get_source_or_403(source_id: uuid.UUID, user_id: uuid.UUID, db: DB) -> Source:
    result = await db.execute(
        select(Source)
        .join(Project, Project.id == Source.project_id)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Project.workspace_id)
        .where(Source.id == source_id, WorkspaceMember.user_id == user_id)
    )
    source = result.scalar_one_or_none()
    if not source:
        raise HTTPException(status_code=404, detail="Source not found")
    return source


async def _enrich(source: Source, db: DB) -> SourceResponse:
    count_result = await db.execute(
        select(func.count()).select_from(SourceChunk).where(SourceChunk.source_id == source.id)
    )
    data = SourceResponse.model_validate(source)
    data.chunk_count = count_result.scalar_one()
    return data
