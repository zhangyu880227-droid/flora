from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.task import Task, TaskStatus
from app.repositories.base import BaseRepository


class TaskRepository(BaseRepository[Task]):
    model = Task

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def list_for_workspace(
        self,
        workspace_id: uuid.UUID,
        *,
        status: TaskStatus | None = None,
        project_id: uuid.UUID | None = None,
        user_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> list[Task]:
        filters = [Task.workspace_id == workspace_id]
        if status is not None:
            filters.append(Task.status == status)
        if project_id is not None:
            filters.append(Task.project_id == project_id)
        if user_id is not None:
            filters.append(Task.user_id == user_id)
        result = await self.db.execute(
            select(Task)
            .where(*filters)
            .order_by(Task.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    async def count_for_workspace(
        self,
        workspace_id: uuid.UUID,
        *,
        status: TaskStatus | None = None,
        user_id: uuid.UUID | None = None,
    ) -> int:
        filters = [Task.workspace_id == workspace_id]
        if status is not None:
            filters.append(Task.status == status)
        if user_id is not None:
            filters.append(Task.user_id == user_id)
        return await self.count(*filters)

    async def get_for_user(self, task_id: uuid.UUID, user_id: uuid.UUID) -> Task | None:
        result = await self.db.execute(
            select(Task).where(Task.id == task_id, Task.user_id == user_id)
        )
        return result.scalar_one_or_none()
