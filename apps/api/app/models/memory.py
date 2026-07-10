"""Memory model — five-tier memory store for the AI Research OS.

Types:
  working      — short-lived scratchpad (current session context)
  long_term    — persisted facts the AI has learned
  conversation — summarized conversation history
  semantic     — embedding-indexed concepts / entities
  document     — content extracted from source documents
"""
from __future__ import annotations

import enum
import uuid

from sqlalchemy import ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base, TimestampMixin, UUIDMixin


class MemoryType(str, enum.Enum):
    working = "working"
    long_term = "long_term"
    conversation = "conversation"
    semantic = "semantic"
    document = "document"


class Memory(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "memories"

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
    # Optional: attach memory to a project / thread / source
    project_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    thread_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("threads.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    memory_type: Mapped[MemoryType] = mapped_column(
        String(20), nullable=False, index=True
    )
    # Key for retrieval within a type namespace (e.g. "user_preference:language")
    key: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # Importance 0.0–1.0; used for pruning low-value working memories
    importance: Mapped[float | None] = mapped_column(
        String(10), nullable=True
    )
    # How many times this memory was accessed / confirmed useful
    access_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Flexible metadata: source_ids, tags, model that created it, etc.
    meta: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    def __repr__(self) -> str:
        return f"Memory(id={self.id}, type={self.memory_type}, key={self.key!r})"
