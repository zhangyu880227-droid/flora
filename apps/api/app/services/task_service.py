from __future__ import annotations

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError, ForbiddenError
from app.models.task import Task, TaskStatus
from app.repositories.task import TaskRepository
from app.schemas.task import TaskCreate, TaskUpdate


class TaskService:
    def __init__(self, db: AsyncSession) -> None:
        self._repo = TaskRepository(db)

    async def list_tasks(
        self,
        workspace_id: uuid.UUID,
        *,
        user_id: uuid.UUID,
        status: TaskStatus | None = None,
        project_id: uuid.UUID | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[Task], int]:
        tasks = await self._repo.list_for_workspace(
            workspace_id,
            status=status,
            project_id=project_id,
            user_id=user_id,
            limit=limit,
            offset=offset,
        )
        total = await self._repo.count_for_workspace(
            workspace_id, status=status, user_id=user_id
        )
        return tasks, total

    async def create_task(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        data: TaskCreate,
    ) -> Task:
        return await self._repo.create(
            workspace_id=workspace_id,
            user_id=user_id,
            title=data.title,
            description=data.description,
            status=data.status,
            priority=data.priority,
            project_id=data.project_id,
            due_date=data.due_date,
            source=data.source or "user",
        )

    async def get_task(self, task_id: uuid.UUID, user_id: uuid.UUID) -> Task:
        task = await self._repo.get_for_user(task_id, user_id)
        if task is None:
            raise NotFoundError(f"Task {task_id} not found")
        return task

    async def update_task(
        self, task_id: uuid.UUID, user_id: uuid.UUID, data: TaskUpdate
    ) -> Task:
        task = await self.get_task(task_id, user_id)
        updates = data.model_dump(exclude_unset=True)
        if updates:
            await self._repo.update(task, **updates)
        return task

    async def delete_task(self, task_id: uuid.UUID, user_id: uuid.UUID) -> None:
        task = await self._repo.get_for_user(task_id, user_id)
        if task is None:
            raise NotFoundError(f"Task {task_id} not found")
        await self._repo.delete(task)
