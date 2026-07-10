from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workspace import Workspace, WorkspaceMember, WorkspaceRole
from app.repositories.base import BaseRepository


class WorkspaceRepository(BaseRepository[Workspace]):
    model = Workspace

    def __init__(self, db: AsyncSession) -> None:
        super().__init__(db)

    async def list_for_user(self, user_id: uuid.UUID) -> list[Workspace]:
        result = await self.db.execute(
            select(Workspace)
            .join(WorkspaceMember, WorkspaceMember.workspace_id == Workspace.id)
            .where(WorkspaceMember.user_id == user_id)
            .order_by(Workspace.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_member(
        self, workspace_id: uuid.UUID, user_id: uuid.UUID
    ) -> WorkspaceMember | None:
        result = await self.db.execute(
            select(WorkspaceMember).where(
                WorkspaceMember.workspace_id == workspace_id,
                WorkspaceMember.user_id == user_id,
            )
        )
        return result.scalar_one_or_none()

    async def is_member(self, workspace_id: uuid.UUID, user_id: uuid.UUID) -> bool:
        return await self.get_member(workspace_id, user_id) is not None

    async def has_role(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        minimum_role: WorkspaceRole,
    ) -> bool:
        member = await self.get_member(workspace_id, user_id)
        if member is None:
            return False
        role_order = {
            WorkspaceRole.viewer: 0,
            WorkspaceRole.editor: 1,
            WorkspaceRole.owner: 2,
        }
        return role_order[member.role] >= role_order[minimum_role]

    async def add_member(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID,
        role: WorkspaceRole = WorkspaceRole.viewer,
    ) -> WorkspaceMember:
        member = WorkspaceMember(
            workspace_id=workspace_id,
            user_id=user_id,
            role=role,
        )
        self.db.add(member)
        await self.db.flush()
        return member

    async def list_members(self, workspace_id: uuid.UUID) -> list[WorkspaceMember]:
        result = await self.db.execute(
            select(WorkspaceMember).where(WorkspaceMember.workspace_id == workspace_id)
        )
        return list(result.scalars().all())
