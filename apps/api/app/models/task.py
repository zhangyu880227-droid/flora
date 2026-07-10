"""Task model — persists user tasks in the database.

Replaces the frontend localStorage Tasks store (Phase 3 migration).
Supports priorities, statuses, due dates, and optional project/workspace scoping.
"""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class TaskStatus(str, enum.Enum):
    todo = "todo"
    in_progress = "in_progress"
    done = "done"


class TaskPriority(str, enum.Enum):
    low = "low"
    medium = "medium"
    high = "high"


class Task(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tasks"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # Optional project scoping
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    title: Mapped[str] = mapped_column(String(500), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[TaskStatus] = mapped_column(
        String(20), nullable=False, default=TaskStatus.todo, index=True
    )
    priority: Mapped[TaskPriority] = mapped_column(
        String(10), nullable=False, default=TaskPriority.medium
    )
    due_date: Mapped[str | None] = mapped_column(String(32), nullable=True)

    # AI-suggested tasks carry a source hint
    source: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # "user" | "ai" | "engine"

    def __repr__(self) -> str:
        return f"Task(id={self.id}, title={self.title!r}, status={self.status})"
