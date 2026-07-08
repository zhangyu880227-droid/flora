import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DB
from app.models.collection import Collection, CollectionSource
from app.models.project import Project
from app.models.source import Source
from app.models.workspace import WorkspaceMember
from app.schemas.source import AddSourceToCollectionRequest, CollectionCreate, CollectionResponse, CollectionUpdate

router = APIRouter()


@router.get("/projects/{project_id}/collections", response_model=list[CollectionResponse])
async def list_collections(project_id: uuid.UUID, current_user: CurrentUser, db: DB) -> list:
    await _assert_project_access(project_id, current_user.id, db)
    result = await db.execute(
        select(Collection).where(Collection.project_id == project_id)
    )
    cols = result.scalars().all()
    return [await _enrich(c, db) for c in cols]


@router.post("/projects/{project_id}/collections", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def create_collection(
    project_id: uuid.UUID, body: CollectionCreate, current_user: CurrentUser, db: DB
) -> CollectionResponse:
    await _assert_project_access(project_id, current_user.id, db)
    col = Collection(project_id=project_id, name=body.name, description=body.description)
    db.add(col)
    await db.flush()
    return await _enrich(col, db)


@router.get("/collections/{collection_id}", response_model=CollectionResponse)
async def get_collection(collection_id: uuid.UUID, current_user: CurrentUser, db: DB) -> CollectionResponse:
    col = await _get_or_403(collection_id, current_user.id, db)
    return await _enrich(col, db)


@router.put("/collections/{collection_id}", response_model=CollectionResponse)
async def update_collection(
    collection_id: uuid.UUID, body: CollectionUpdate, current_user: CurrentUser, db: DB
) -> CollectionResponse:
    col = await _get_or_403(collection_id, current_user.id, db)
    if body.name is not None:
        col.name = body.name
    if body.description is not None:
        col.description = body.description
    return await _enrich(col, db)


@router.delete("/collections/{collection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_collection(collection_id: uuid.UUID, current_user: CurrentUser, db: DB) -> None:
    col = await _get_or_403(collection_id, current_user.id, db)
    await db.delete(col)


@router.post("/collections/{collection_id}/sources", status_code=status.HTTP_201_CREATED)
async def add_source(
    collection_id: uuid.UUID, body: AddSourceToCollectionRequest, current_user: CurrentUser, db: DB
) -> dict:
    col = await _get_or_403(collection_id, current_user.id, db)
    source_id = uuid.UUID(body.source_id)
    existing = await db.execute(
        select(CollectionSource).where(
            CollectionSource.collection_id == collection_id,
            CollectionSource.source_id == source_id,
        )
    )
    if not existing.scalar_one_or_none():
        db.add(CollectionSource(collection_id=collection_id, source_id=source_id))
    return {"ok": True}


@router.delete("/collections/{collection_id}/sources/{source_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_source(
    collection_id: uuid.UUID, source_id: uuid.UUID, current_user: CurrentUser, db: DB
) -> None:
    col = await _get_or_403(collection_id, current_user.id, db)
    result = await db.execute(
        select(CollectionSource).where(
            CollectionSource.collection_id == collection_id,
            CollectionSource.source_id == source_id,
        )
    )
    link = result.scalar_one_or_none()
    if link:
        await db.delete(link)


async def _assert_project_access(project_id: uuid.UUID, user_id: uuid.UUID, db: DB) -> None:
    result = await db.execute(
        select(Project)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Project.workspace_id)
        .where(Project.id == project_id, WorkspaceMember.user_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Project not found or access denied")


async def _get_or_403(collection_id: uuid.UUID, user_id: uuid.UUID, db: DB) -> Collection:
    result = await db.execute(
        select(Collection)
        .join(Project, Project.id == Collection.project_id)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Project.workspace_id)
        .where(Collection.id == collection_id, WorkspaceMember.user_id == user_id)
    )
    col = result.scalar_one_or_none()
    if not col:
        raise HTTPException(status_code=404, detail="Collection not found")
    return col


async def _enrich(col: Collection, db: DB) -> CollectionResponse:
    count_result = await db.execute(
        select(func.count()).select_from(CollectionSource).where(CollectionSource.collection_id == col.id)
    )
    data = CollectionResponse.model_validate(col)
    data.source_count = count_result.scalar_one()
    return data
