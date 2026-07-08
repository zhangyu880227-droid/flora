import uuid

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base, TimestampMixin, UUIDMixin


class Collection(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "collections"

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)

    project: Mapped["Project"] = relationship("Project", back_populates="collections")  # type: ignore[name-defined]  # noqa: F821
    source_links: Mapped[list["CollectionSource"]] = relationship(
        "CollectionSource", back_populates="collection", cascade="all, delete-orphan"
    )


class CollectionSource(Base):
    __tablename__ = "collection_sources"

    collection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("collections.id", ondelete="CASCADE"),
        primary_key=True,
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sources.id", ondelete="CASCADE"),
        primary_key=True,
    )

    collection: Mapped[Collection] = relationship("Collection", back_populates="source_links")
    source: Mapped["Source"] = relationship("Source")  # type: ignore[name-defined]  # noqa: F821
