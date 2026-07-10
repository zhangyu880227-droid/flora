"""Automatic Learning models — track the learn→memorize→KG cycle."""
from __future__ import annotations

import uuid

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class LearningJob(Base, UUIDMixin, TimestampMixin):
    """Tracks one run of the Automatic Learning pipeline for a workspace.

    A learning job:
    1. Picks up recently processed KnowledgeDocuments
    2. Creates Memory records (document + semantic types)
    3. Updates the Knowledge Graph via KGService
    """
    __tablename__ = "learning_jobs"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    # scheduled | manual
    trigger: Mapped[str] = mapped_column(String(50), nullable=False, default="scheduled")

    # running | completed | failed
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="running", index=True)

    # Stats
    documents_scanned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    memories_created: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    kg_nodes_updated: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
