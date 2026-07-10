"""
Generic base repository for SQLAlchemy 2.x async sessions.

Usage:
    class ProjectRepository(BaseRepository[Project]):
        model = Project

        async def list_by_workspace(self, workspace_id: UUID) -> list[Project]:
            result = await self.db.execute(
                select(self.model).where(self.model.workspace_id == workspace_id)
            )
            return list(result.scalars().all())
"""
from __future__ import annotations

import uuid
from typing import Any, Generic, TypeVar

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import Base

M = TypeVar("M", bound=Base)


class BaseRepository(Generic[M]):
    """Thin async repository wrapping an SQLAlchemy AsyncSession.

    Subclasses must set the class-level `model` attribute.
    All DB access in the Service layer should go through a repository,
    not via raw `db.execute(select(...))` calls.
    """

    model: type[M]

    def __init__(self, db: AsyncSession) -> None:
        self.db = db

    # ── Read ──────────────────────────────────────────────────────────────────

    async def get(self, id: uuid.UUID) -> M | None:
        """Fetch a single record by primary key."""
        return await self.db.get(self.model, id)

    async def get_or_raise(self, id: uuid.UUID, error_msg: str | None = None) -> M:
        """Fetch a record or raise NotFoundError."""
        from app.core.errors import NotFoundError
        obj = await self.get(id)
        if obj is None:
            raise NotFoundError(error_msg or self.model.__name__)
        return obj

    async def list(
        self,
        *,
        filters: list[Any] | None = None,
        order_by: Any | None = None,
        limit: int | None = None,
        offset: int = 0,
    ) -> list[M]:
        """Fetch multiple records with optional filtering, ordering, and pagination."""
        q = select(self.model)
        if filters:
            q = q.where(*filters)
        if order_by is not None:
            q = q.order_by(order_by)
        if offset:
            q = q.offset(offset)
        if limit is not None:
            q = q.limit(limit)
        result = await self.db.execute(q)
        return list(result.scalars().all())

    async def count(self, *filters: Any) -> int:
        """Count records matching filters."""
        from sqlalchemy import func
        q = select(func.count()).select_from(self.model)
        if filters:
            q = q.where(*filters)
        result = await self.db.execute(q)
        return result.scalar_one()

    async def exists(self, *filters: Any) -> bool:
        """Return True if any record matches filters."""
        return await self.count(*filters) > 0

    # ── Write ─────────────────────────────────────────────────────────────────

    async def create(self, **kwargs: Any) -> M:
        """Instantiate, add, and flush a new record."""
        obj = self.model(**kwargs)
        self.db.add(obj)
        await self.db.flush()
        return obj

    async def update(self, obj: M, **kwargs: Any) -> M:
        """Apply keyword-argument updates to an ORM instance and flush."""
        for key, value in kwargs.items():
            if value is not None:
                setattr(obj, key, value)
        await self.db.flush()
        return obj

    async def delete(self, obj: M) -> None:
        """Delete a record and flush."""
        await self.db.delete(obj)
        await self.db.flush()

    async def delete_by_id(self, id: uuid.UUID) -> bool:
        """Delete by primary key; returns True if a record was found."""
        obj = await self.get(id)
        if obj is None:
            return False
        await self.delete(obj)
        return True
