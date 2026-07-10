"""Automatic Learning API — view and trigger the learn→memory→KG pipeline."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, DB
from app.core.response import ok, paginated
from app.models.workspace import WorkspaceMember

router = APIRouter()


class LearningJobRead(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    trigger: str
    status: str
    documents_scanned: int
    memories_created: int
    kg_nodes_updated: int
    error_message: str | None
    summary: dict | None
    created_at: str

    model_config = {"from_attributes": True}


async def _assert_member(workspace_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> None:
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a workspace member")


@router.get("/workspaces/{workspace_id}/learning/jobs")
async def list_learning_jobs(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    limit: int = Query(20, ge=1, le=100),
):
    """List recent learning jobs for a workspace."""
    await _assert_member(workspace_id, current_user.id, db)
    from app.services.learning_service import LearningService
    svc = LearningService(db)
    jobs = await svc.list_jobs(workspace_id, limit=limit)
    items = [LearningJobRead.model_validate(j).model_dump() for j in jobs]
    return paginated(items, total=len(items), limit=limit, offset=0)


@router.post("/workspaces/{workspace_id}/learning/run")
async def trigger_learning_run(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    """Trigger an immediate learning run for this workspace."""
    await _assert_member(workspace_id, current_user.id, db)
    from app.tasks.learning_tasks import run_learning_pipeline
    task = run_learning_pipeline.apply_async(kwargs={"workspace_id": str(workspace_id)})
    return ok({"task_id": task.id, "status": "queued"})


@router.get("/workspaces/{workspace_id}/learning/stats")
async def learning_stats(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    """Return aggregate learning stats: totals across all completed jobs."""
    await _assert_member(workspace_id, current_user.id, db)
    from app.services.learning_service import LearningService
    svc = LearningService(db)
    jobs = await svc.list_jobs(workspace_id, limit=500)
    completed = [j for j in jobs if j.status == "completed"]
    return ok({
        "total_jobs": len(jobs),
        "completed_jobs": len(completed),
        "failed_jobs": sum(1 for j in jobs if j.status == "failed"),
        "total_documents_scanned": sum(j.documents_scanned for j in completed),
        "total_memories_created": sum(j.memories_created for j in completed),
        "total_kg_nodes_updated": sum(j.kg_nodes_updated for j in completed),
    })
