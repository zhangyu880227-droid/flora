"""Agent Framework API — create, manage, and query agent jobs."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, DB
from app.core.errors import NotFoundError
from app.core.response import err, ok, paginated
from app.models.agent import AgentJobStatus
from app.models.workspace import WorkspaceMember
from app.schemas.agent import AgentExecutionRead, AgentJobCreate, AgentJobRead
from app.services.agent_service import AgentService

router = APIRouter()

SUPPORTED_AGENT_TYPES = ["research", "summarize", "extract_entities"]


async def _assert_member(workspace_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> None:
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a workspace member")


@router.get("/workspaces/{workspace_id}/agents/types")
async def list_agent_types(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    """Return the list of available agent types."""
    await _assert_member(workspace_id, current_user.id, db)
    return ok(SUPPORTED_AGENT_TYPES)


@router.get("/workspaces/{workspace_id}/agents/jobs")
async def list_jobs(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    agent_type: str | None = Query(None),
    status: AgentJobStatus | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = AgentService(db)
    offset = (page - 1) * page_size
    jobs, total = await svc.list_jobs(
        workspace_id,
        agent_type=agent_type,
        status=status,
        limit=page_size,
        offset=offset,
    )
    items = [AgentJobRead.model_validate(j).model_dump() for j in jobs]
    return paginated(items, total, page, page_size)


@router.post("/workspaces/{workspace_id}/agents/jobs", status_code=201)
async def create_and_dispatch_job(
    workspace_id: uuid.UUID,
    body: AgentJobCreate,
    current_user: CurrentUser,
    db: DB,
):
    """Create an AgentJob and immediately dispatch it via Celery."""
    await _assert_member(workspace_id, current_user.id, db)

    if body.agent_type not in SUPPORTED_AGENT_TYPES:
        return err(
            "UNSUPPORTED_AGENT_TYPE",
            f"agent_type must be one of {SUPPORTED_AGENT_TYPES}",
            http_status=422,
        )

    svc = AgentService(db)
    job = await svc.create_job(
        workspace_id=workspace_id,
        user_id=current_user.id,
        agent_type=body.agent_type,
        name=body.name,
        goal=body.goal,
        input_data=body.input_data,
    )
    execution = await svc.create_execution(job, attempt=1)
    await db.commit()
    await db.refresh(job)
    await db.refresh(execution)

    # Dispatch to Celery
    from app.tasks.agent_tasks import run_agent_execution
    celery_task = run_agent_execution.delay(str(execution.id))

    # Store task ID
    execution.celery_task_id = celery_task.id
    job.celery_task_id = celery_task.id
    await db.commit()
    await db.refresh(job)

    return ok({
        **AgentJobRead.model_validate(job).model_dump(),
        "execution_id": str(execution.id),
    })


@router.get("/workspaces/{workspace_id}/agents/jobs/{job_id}")
async def get_job(
    workspace_id: uuid.UUID,
    job_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = AgentService(db)
    try:
        job = await svc.get_job(job_id, workspace_id)
    except NotFoundError as e:
        return err(e.code, e.message, http_status=404)
    return ok(AgentJobRead.model_validate(job).model_dump())


@router.delete("/workspaces/{workspace_id}/agents/jobs/{job_id}")
async def cancel_job(
    workspace_id: uuid.UUID,
    job_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = AgentService(db)
    try:
        job = await svc.cancel_job(job_id, workspace_id)
    except NotFoundError as e:
        return err(e.code, e.message, http_status=404)
    await db.commit()
    return ok(AgentJobRead.model_validate(job).model_dump())


@router.get("/workspaces/{workspace_id}/agents/jobs/{job_id}/executions")
async def list_executions(
    workspace_id: uuid.UUID,
    job_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    """Return execution history for an agent job."""
    await _assert_member(workspace_id, current_user.id, db)
    svc = AgentService(db)
    try:
        await svc.get_job(job_id, workspace_id)  # auth check
    except NotFoundError as e:
        return err(e.code, e.message, http_status=404)
    executions = await svc.list_executions(job_id, workspace_id)
    items = [AgentExecutionRead.model_validate(e).model_dump() for e in executions]
    return ok({"job_id": str(job_id), "executions": items})
