from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.memory import Memory, MemoryType
from app.repositories.base import BaseRepository


class MemoryRepository(BaseRepository[Memory]):
    model = Memory

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def list_for_user(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        *,
        memory_type: MemoryType | None = None,
        project_id: uuid.UUID | None = None,
        thread_id: uuid.UUID | None = None,
        key_prefix: str | None = None,
        limit: int = 100,
        offset: int = 0,
    ) -> list[Memory]:
        filters = [
            Memory.workspace_id == workspace_id,
            Memory.user_id == user_id,
        ]
        if memory_type is not None:
            filters.append(Memory.memory_type == memory_type)
        if project_id is not None:
            filters.append(Memory.project_id == project_id)
        if thread_id is not None:
            filters.append(Memory.thread_id == thread_id)
        if key_prefix is not None:
            filters.append(Memory.key.like(f"{key_prefix}%"))

        result = await self.db.execute(
            select(Memory)
            .where(*filters)
            .order_by(Memory.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def count_for_user(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        *,
        memory_type: MemoryType | None = None,
    ) -> int:
        filters = [
            Memory.workspace_id == workspace_id,
            Memory.user_id == user_id,
        ]
        if memory_type is not None:
            filters.append(Memory.memory_type == memory_type)
        return await self.count(*filters)

    async def get_by_key(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        memory_type: MemoryType,
        key: str,
    ) -> Memory | None:
        result = await self.db.execute(
            select(Memory).where(
                Memory.workspace_id == workspace_id,
                Memory.user_id == user_id,
                Memory.memory_type == memory_type,
                Memory.key == key,
            )
        )
        return result.scalar_one_or_none()

    async def increment_access(self, memory: Memory) -> Memory:
        memory.access_count = (memory.access_count or 0) + 1
        await self.db.flush()
        return memory

    async def list_for_workspace(
        self,
        workspace_id: uuid.UUID,
        *,
        memory_type: MemoryType | None = None,
        limit: int = 500,
        offset: int = 0,
    ) -> list[Memory]:
        """Query all memories in a workspace regardless of user (for engine tasks)."""
        filters = [Memory.workspace_id == workspace_id]
        if memory_type is not None:
            filters.append(Memory.memory_type == memory_type)
        result = await self.db.execute(
            select(Memory)
            .where(*filters)
            .order_by(Memory.created_at.asc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def purge_working_memory(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        project_id: uuid.UUID | None = None,
    ) -> int:
        """Delete all working-memory entries for a user (e.g. session reset)."""
        memories = await self.list_for_user(
            workspace_id,
            user_id,
            memory_type=MemoryType.working,
            project_id=project_id,
            limit=1000,
        )
        for m in memories:
            await self.db.delete(m)
        await self.db.flush()
        return len(memories)
