"""Memory CRUD — workspace-scoped five-tier memory store."""
from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, DB
from app.core.errors import NotFoundError
from app.core.response import err, ok, paginated
from app.models.memory import MemoryType
from app.models.workspace import WorkspaceMember
from app.schemas.memory import MemoryCreate, MemoryRead, MemoryUpdate
from app.services.memory_service import MemoryService

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


@router.get("/workspaces/{workspace_id}/memories")
async def list_memories(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    memory_type: MemoryType | None = Query(None),
    project_id: uuid.UUID | None = Query(None),
    thread_id: uuid.UUID | None = Query(None),
    key_prefix: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(100, ge=1, le=500),
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = MemoryService(db)
    offset = (page - 1) * page_size
    memories, total = await svc.list_memories(
        workspace_id,
        current_user.id,
        memory_type=memory_type,
        project_id=project_id,
        thread_id=thread_id,
        key_prefix=key_prefix,
        limit=page_size,
        offset=offset,
    )
    items = [MemoryRead.model_validate(m).model_dump() for m in memories]
    return paginated(items, total, page, page_size)


@router.post("/workspaces/{workspace_id}/memories", status_code=201)
async def upsert_memory(
    workspace_id: uuid.UUID,
    body: MemoryCreate,
    current_user: CurrentUser,
    db: DB,
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = MemoryService(db)
    memory, created = await svc.upsert_memory(workspace_id, current_user.id, body)
    await db.commit()
    await db.refresh(memory)
    return ok({**MemoryRead.model_validate(memory).model_dump(), "created": created})


@router.get("/workspaces/{workspace_id}/memories/{memory_id}")
async def get_memory(
    workspace_id: uuid.UUID,
    memory_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = MemoryService(db)
    try:
        memory = await svc.get_memory(memory_id, current_user.id)
    except NotFoundError as e:
        return err(e.code, e.message, http_status=404)
    await db.commit()
    return ok(MemoryRead.model_validate(memory).model_dump())


@router.patch("/workspaces/{workspace_id}/memories/{memory_id}")
async def update_memory(
    workspace_id: uuid.UUID,
    memory_id: uuid.UUID,
    body: MemoryUpdate,
    current_user: CurrentUser,
    db: DB,
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = MemoryService(db)
    try:
        memory = await svc.update_memory(memory_id, current_user.id, body)
    except NotFoundError as e:
        return err(e.code, e.message, http_status=404)
    await db.commit()
    await db.refresh(memory)
    return ok(MemoryRead.model_validate(memory).model_dump())


@router.delete("/workspaces/{workspace_id}/memories/{memory_id}")
async def delete_memory(
    workspace_id: uuid.UUID,
    memory_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = MemoryService(db)
    try:
        await svc.delete_memory(memory_id, current_user.id)
    except NotFoundError as e:
        return err(e.code, e.message, http_status=404)
    await db.commit()
    return ok({"deleted": True})


@router.delete("/workspaces/{workspace_id}/memories/working/purge")
async def purge_working_memory(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    project_id: uuid.UUID | None = Query(None),
):
    await _assert_member(workspace_id, current_user.id, db)
    svc = MemoryService(db)
    count = await svc.purge_working_memory(workspace_id, current_user.id, project_id)
    await db.commit()
    return ok({"purged": count})
