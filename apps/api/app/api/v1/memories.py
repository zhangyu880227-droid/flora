"""Memory CRUD + search/stats/timeline — workspace-scoped five-tier memory store."""
from __future__ import annotations

import uuid

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, DB
from app.core.errors import NotFoundError
from app.core.response import err, ok, paginated
from app.models.memory import Memory, MemoryType
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


@router.get("/workspaces/{workspace_id}/memories/search")
async def search_memories(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    q: str = Query(..., min_length=1, description="Full-text search query"),
    memory_type: MemoryType | None = Query(None),
    limit: int = Query(20, ge=1, le=100),
):
    """Keyword search across memory content and keys (case-insensitive ILIKE)."""
    await _assert_member(workspace_id, current_user.id, db)
    term = f"%{q}%"
    filters = [
        Memory.workspace_id == workspace_id,
        Memory.user_id == current_user.id,
        (Memory.content.ilike(term) | Memory.key.ilike(term)),
    ]
    if memory_type is not None:
        filters.append(Memory.memory_type == memory_type)

    result = await db.execute(
        select(Memory)
        .where(*filters)
        .order_by(Memory.access_count.desc(), Memory.created_at.desc())
        .limit(limit)
    )
    memories = result.scalars().all()
    items = [MemoryRead.model_validate(m).model_dump() for m in memories]
    return ok({"query": q, "count": len(items), "results": items})


@router.get("/workspaces/{workspace_id}/memories/stats")
async def memory_stats(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    """Return counts by memory type for the current user in this workspace."""
    await _assert_member(workspace_id, current_user.id, db)
    result = await db.execute(
        select(Memory.memory_type, func.count(Memory.id))
        .where(
            Memory.workspace_id == workspace_id,
            Memory.user_id == current_user.id,
        )
        .group_by(Memory.memory_type)
    )
    rows = result.fetchall()
    counts = {row[0]: row[1] for row in rows}
    total = sum(counts.values())
    return ok({
        "total": total,
        "by_type": {t.value: counts.get(t, 0) for t in MemoryType},
    })


@router.get("/workspaces/{workspace_id}/memories/timeline")
async def memory_timeline(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    days: int = Query(30, ge=1, le=365),
):
    """Return daily memory creation counts for the past N days."""
    await _assert_member(workspace_id, current_user.id, db)
    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(
            func.date_trunc("day", Memory.created_at).label("day"),
            Memory.memory_type,
            func.count(Memory.id).label("count"),
        )
        .where(
            Memory.workspace_id == workspace_id,
            Memory.user_id == current_user.id,
            Memory.created_at >= since,
        )
        .group_by("day", Memory.memory_type)
        .order_by("day")
    )
    rows = result.fetchall()
    timeline = [
        {"day": str(row[0])[:10], "type": row[1], "count": row[2]}
        for row in rows
    ]
    return ok({"days": days, "timeline": timeline})


@router.post("/workspaces/{workspace_id}/memories/engine/run")
async def trigger_memory_engine(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
):
    """Manually trigger the Memory Engine for this workspace (async via Celery)."""
    await _assert_member(workspace_id, current_user.id, db)
    from app.tasks.memory_tasks import run_memory_engine
    task = run_memory_engine.delay(str(workspace_id))
    return ok({"task_id": task.id, "status": "queued"})
