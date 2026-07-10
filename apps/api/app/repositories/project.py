from __future__ import annotations

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.project import Project
from app.models.source import Source
from app.models.workspace import WorkspaceMember
from app.repositories.base import BaseRepository


class ProjectRepository(BaseRepository[Project]):
    model = Project

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def list_for_workspace(self, workspace_id: uuid.UUID) -> list[Project]:
        result = await self.db.execute(
            select(Project)
            .where(Project.workspace_id == workspace_id)
            .order_by(Project.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_for_user(
        self, project_id: uuid.UUID, user_id: uuid.UUID
    ) -> Project | None:
        """Return a project only if the user is a member of its workspace."""
        result = await self.db.execute(
            select(Project)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Project.workspace_id)
            .where(Project.id == project_id, WorkspaceMember.user_id == user_id)
        )
        return result.scalar_one_or_none()

    async def source_count(self, project_id: uuid.UUID) -> int:
        result = await self.db.execute(
            select(func.count()).select_from(Source).where(Source.project_id == project_id)
        )
        return result.scalar_one()
