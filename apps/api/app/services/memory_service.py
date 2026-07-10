from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.models.memory import Memory, MemoryType
from app.repositories.memory import MemoryRepository
from app.schemas.memory import MemoryCreate, MemoryUpdate


class MemoryService:
    def __init__(self, db: AsyncSession) -> None:
        self._repo = MemoryRepository(db)

    async def list_memories(
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
    ) -> tuple[list[Memory], int]:
        memories = await self._repo.list_for_user(
            workspace_id,
            user_id,
            memory_type=memory_type,
            project_id=project_id,
            thread_id=thread_id,
            key_prefix=key_prefix,
            limit=limit,
            offset=offset,
        )
        total = await self._repo.count_for_user(
            workspace_id, user_id, memory_type=memory_type
        )
        return memories, total

    async def upsert_memory(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        data: MemoryCreate,
    ) -> tuple[Memory, bool]:
        """Create or update a keyed memory. Returns (memory, created)."""
        if data.key:
            existing = await self._repo.get_by_key(
                workspace_id, user_id, data.memory_type, data.key
            )
            if existing:
                await self._repo.update(
                    existing,
                    content=data.content,
                    importance=str(data.importance) if data.importance is not None else None,
                    meta=data.meta,
                )
                return existing, False

        memory = await self._repo.create(
            workspace_id=workspace_id,
            user_id=user_id,
            memory_type=data.memory_type,
            content=data.content,
            key=data.key,
            importance=str(data.importance) if data.importance is not None else None,
            project_id=data.project_id,
            thread_id=data.thread_id,
            meta=data.meta,
            access_count=0,
        )
        return memory, True

    async def get_memory(self, memory_id: uuid.UUID, user_id: uuid.UUID) -> Memory:
        memory = await self._repo.get(memory_id)
        if memory is None or memory.user_id != user_id:
            raise NotFoundError(f"Memory {memory_id} not found")
        await self._repo.increment_access(memory)
        return memory

    async def update_memory(
        self,
        memory_id: uuid.UUID,
        user_id: uuid.UUID,
        data: MemoryUpdate,
    ) -> Memory:
        memory = await self._repo.get(memory_id)
        if memory is None or memory.user_id != user_id:
            raise NotFoundError(f"Memory {memory_id} not found")
        updates = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
        if "importance" in updates:
            updates["importance"] = str(updates["importance"])
        if updates:
            await self._repo.update(memory, **updates)
        return memory

    async def delete_memory(self, memory_id: uuid.UUID, user_id: uuid.UUID) -> None:
        memory = await self._repo.get(memory_id)
        if memory is None or memory.user_id != user_id:
            raise NotFoundError(f"Memory {memory_id} not found")
        await self._repo.delete(memory)

    async def purge_working_memory(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        project_id: uuid.UUID | None = None,
    ) -> int:
        return await self._repo.purge_working_memory(workspace_id, user_id, project_id)
