"""Tasks CRUD — workspace-scoped personal task management."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, DB
from app.core.errors import NotFoundError
from app.core.response import err, ok, paginated
from app.models.task import TaskStatus
from app.models.workspace import WorkspaceMember
from app.schemas.task import TaskCreate, TaskRead, TaskUpdate
from app.services.task_service import TaskService

router = APIRouter()


async def _assert_member(workspace_id: uuid.UUID, user_id: uuid.UUID, db: AsyncSession) -> None:
    result = await db.execute(
        select(WorkspaceMember).where(
            WorkspaceMember.workspace_id == workspace_id,
            WorkspaceMember.user_id == user_id,
        )
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=403, detail="Not a workspace member")


@router.get("/workspaces/{workspace_id}/tasks")
async def list_tasks(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    status: TaskStatus | None = Query(None),
    project_id: uuid.UUID | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = TaskService(db)
    offset = (page - 1) * page_size
    tasks, total = await svc.list_tasks(
        workspace_id,
        user_id=current_user.id,
        status=status,
        project_id=project_id,
        limit=page_size,
        offset=offset,
    )
    items = [TaskRead.model_validate(t).model_dump() for t in tasks]
    return paginated(items, total, page, page_size)


@router.post("/workspaces/{workspace_id}/tasks", status_code=201)
async def create_task(
    workspace_id: uuid.UUID,
    body: TaskCreate,
    current_user: CurrentUser,
    db: DB,
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = TaskService(db)
    task = await svc.create_task(workspace_id, current_user.id, body)
    await db.commit()
    await db.refresh(task)
    return ok(TaskRead.model_validate(task).model_dump())


@router.get("/workspaces/{workspace_id}/tasks/{task_id}")
async def get_task(
    workspace_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = TaskService(db)
    try:
        task = await svc.get_task(task_id, current_user.id)
    except NotFoundError as e:
        return err(e.code, e.message, http_status=404)
    return ok(TaskRead.model_validate(task).model_dump())


@router.patch("/workspaces/{workspace_id}/tasks/{task_id}")
async def update_task(
    workspace_id: uuid.UUID,
    task_id: uuid.UUID,
    body: TaskUpdate,
    current_user: CurrentUser,
    db: DB,
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = TaskService(db)
    try:
        task = await svc.update_task(task_id, current_user.id, body)
    except NotFoundError as e:
        return err(e.code, e.message, http_status=404)
    await db.commit()
    await db.refresh(task)
    return ok(TaskRead.model_validate(task).model_dump())


@router.delete("/workspaces/{workspace_id}/tasks/{task_id}")
async def delete_task(
    workspace_id: uuid.UUID,
    task_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = TaskService(db)
    try:
        await svc.delete_task(task_id, current_user.id)
    except NotFoundError as e:
        return err(e.code, e.message, http_status=404)
    await db.commit()
    return ok({"deleted": True})
