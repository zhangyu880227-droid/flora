import uuid

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import CurrentUser, DB
from app.models.insight import Insight
from app.models.project import Project
from app.models.source import Source
from app.models.workspace import WorkspaceMember
from app.schemas.insight import InsightGenerateRequest, InsightResponse
from app.services.ai import generate_insight

router = APIRouter()


@router.get("/projects/{project_id}/insights", response_model=list[InsightResponse])
async def list_insights(project_id: uuid.UUID, current_user: CurrentUser, db: DB) -> list:
    await _assert_project_access(project_id, current_user.id, db)
    result = await db.execute(
        select(Insight).where(Insight.project_id == project_id).order_by(Insight.created_at.desc())
    )
    return [InsightResponse.model_validate(i) for i in result.scalars().all()]


@router.post("/projects/{project_id}/insights/generate", response_model=InsightResponse, status_code=status.HTTP_201_CREATED)
async def generate(
    project_id: uuid.UUID, body: InsightGenerateRequest, current_user: CurrentUser, db: DB
) -> InsightResponse:
    await _assert_project_access(project_id, current_user.id, db)

    source_ids = [uuid.UUID(sid) for sid in body.source_ids]
    result = await db.execute(
        select(Source).where(Source.id.in_(source_ids), Source.project_id == project_id)
    )
    sources = result.scalars().all()
    if not sources:
        raise HTTPException(status_code=400, detail="No valid sources found")

    sources_text = "\n\n---\n\n".join(
        f"[{s.title}]\n{s.raw_text or '(no text)'}" for s in sources
    )

    content = await generate_insight(body.title, sources_text, body.prompt)

    insight = Insight(
        project_id=project_id,
        title=body.title,
        content=content,
        sources=[{"source_id": str(s.id), "source_title": s.title} for s in sources],
        created_by=current_user.id,
    )
    db.add(insight)
    await db.flush()
    return InsightResponse.model_validate(insight)


@router.delete("/insights/{insight_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_insight(insight_id: uuid.UUID, current_user: CurrentUser, db: DB) -> None:
    result = await db.execute(
        select(Insight)
        .join(Project, Project.id == Insight.project_id)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Project.workspace_id)
        .where(Insight.id == insight_id, WorkspaceMember.user_id == current_user.id)
    )
    insight = result.scalar_one_or_none()
    if not insight:
        raise HTTPException(status_code=404, detail="Insight not found")
    await db.delete(insight)


async def _assert_project_access(project_id: uuid.UUID, user_id: uuid.UUID, db: DB) -> None:
    result = await db.execute(
        select(Project)
        .join(WorkspaceMember, WorkspaceMember.workspace_id == Project.workspace_id)
        .where(Project.id == project_id, WorkspaceMember.user_id == user_id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Project not found")
