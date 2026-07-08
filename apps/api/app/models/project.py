import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class Project(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "projects"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    workspace: Mapped["Workspace"] = relationship("Workspace", back_populates="projects")  # type: ignore[name-defined]  # noqa: F821
    sources: Mapped[list["Source"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Source", back_populates="project", cascade="all, delete-orphan"
    )
    collections: Mapped[list["Collection"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Collection", back_populates="project", cascade="all, delete-orphan"
    )
    threads: Mapped[list["Thread"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Thread", back_populates="project", cascade="all, delete-orphan"
    )
    insights: Mapped[list["Insight"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "Insight", back_populates="project", cascade="all, delete-orphan"
    )
