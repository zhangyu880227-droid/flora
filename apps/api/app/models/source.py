import enum
import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Enum, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.db.base import Base, TimestampMixin, UUIDMixin


class SourceType(str, enum.Enum):
    pdf = "pdf"
    url = "url"
    note = "note"
    youtube = "youtube"
    arxiv = "arxiv"


class SourceStatus(str, enum.Enum):
    pending = "pending"
    processing = "processing"
    ready = "ready"
    error = "error"


class Source(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "sources"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    type: Mapped[SourceType] = mapped_column(Enum(SourceType), nullable=False)
    title: Mapped[str] = mapped_column(String(500), nullable=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    file_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)
    status: Mapped[SourceStatus] = mapped_column(
        Enum(SourceStatus), nullable=False, default=SourceStatus.pending, index=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    project: Mapped["Project"] = relationship("Project", back_populates="sources")  # type: ignore[name-defined]  # noqa: F821
    chunks: Mapped[list["SourceChunk"]] = relationship(
        "SourceChunk", back_populates="source", cascade="all, delete-orphan"
    )
    tags: Mapped[list["SourceTag"]] = relationship(  # type: ignore[name-defined]  # noqa: F821
        "SourceTag", back_populates="source", cascade="all, delete-orphan"
    )


class SourceChunk(Base, UUIDMixin):
    __tablename__ = "source_chunks"

    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_index: Mapped[int] = mapped_column(Integer, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(settings.embedding_dimensions), nullable=True
    )
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)

    source: Mapped[Source] = relationship("Source", back_populates="chunks")
