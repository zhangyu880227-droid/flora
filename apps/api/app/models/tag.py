import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class Tag(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "tags"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(7), nullable=False, default="#6366f1")

    source_links: Mapped[list["SourceTag"]] = relationship(
        "SourceTag", back_populates="tag", cascade="all, delete-orphan"
    )


class SourceTag(Base):
    __tablename__ = "source_tags"

    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="CASCADE"),
        primary_key=True,
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tags.id", ondelete="CASCADE"),
        primary_key=True,
    )

    source: Mapped["Source"] = relationship("Source", back_populates="tags")  # type: ignore[name-defined]  # noqa: F821
    tag: Mapped[Tag] = relationship("Tag", back_populates="source_links")
