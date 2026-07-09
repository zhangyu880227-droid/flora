import uuid

from pgvector.sqlalchemy import Vector
from sqlalchemy import Boolean, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.config import settings
from app.db.base import Base, TimestampMixin, UUIDMixin

# Feed types: rss | arxiv | github_trending | github_repo | youtube | url | pdf | google_news


class KnowledgeFeed(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "knowledge_feeds"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # rss | arxiv | github_trending | github_repo | youtube | url | pdf
    type: Mapped[str] = mapped_column(String(50), nullable=False)
    config: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    schedule_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=30)
    last_collected_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_collect_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    consecutive_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    documents: Mapped[list["KnowledgeDocument"]] = relationship(
        "KnowledgeDocument", back_populates="feed", cascade="all, delete-orphan"
    )
    runs: Mapped[list["KnowledgeIngestionRun"]] = relationship(
        "KnowledgeIngestionRun", back_populates="feed"
    )


class KnowledgeDocument(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "knowledge_documents"
    __table_args__ = (
        UniqueConstraint("workspace_id", "content_hash", name="uq_kd_workspace_hash"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    feed_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_feeds.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    # rss | arxiv | github_trending | github_repo | youtube | url | pdf
    source_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str | None] = mapped_column(Text, nullable=True)
    author: Mapped[str | None] = mapped_column(Text, nullable=True)
    published_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    collected_at: Mapped[str] = mapped_column(Text, nullable=False)

    # Content stages
    raw_content: Mapped[str | None] = mapped_column(Text, nullable=True)
    clean_content: Mapped[str | None] = mapped_column(Text, nullable=True)

    # AI knowledge extraction
    summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    key_insights: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    entities: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    relationships: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    tags: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Importance score: 0.0-1.0, derived from AI assessment + entity density
    importance_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)

    # Deduplication
    content_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)

    # Embedding
    embedding: Mapped[list[float] | None] = mapped_column(
        Vector(settings.embedding_dimensions), nullable=True
    )

    # Pipeline status
    status: Mapped[str] = mapped_column(
        String(50), nullable=False, default="pending", index=True
    )
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_: Mapped[dict] = mapped_column("metadata", JSONB, nullable=False, default=dict)

    feed: Mapped["KnowledgeFeed | None"] = relationship("KnowledgeFeed", back_populates="documents")


class KnowledgeIngestionRun(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "knowledge_ingestion_runs"

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    feed_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("knowledge_feeds.id", ondelete="SET NULL"),
        nullable=True,
    )
    # scheduled | manual
    run_type: Mapped[str] = mapped_column(String(50), nullable=False, default="scheduled")
    started_at: Mapped[str] = mapped_column(Text, nullable=False)
    completed_at: Mapped[str | None] = mapped_column(Text, nullable=True)
    # running | completed | failed | partial
    status: Mapped[str] = mapped_column(String(50), nullable=False, default="running", index=True)
    documents_found: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    documents_new: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    documents_skipped: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    documents_failed: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    feed: Mapped["KnowledgeFeed | None"] = relationship("KnowledgeFeed", back_populates="runs")


class KGNode(Base, UUIDMixin, TimestampMixin):
    """A unique entity node in the cross-document Knowledge Graph."""
    __tablename__ = "kg_nodes"
    __table_args__ = (
        UniqueConstraint("workspace_id", "label", "entity_type", name="uq_kg_node"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    label: Mapped[str] = mapped_column(Text, nullable=False)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)  # person|org|tech|concept|place
    doc_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_relevance: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    first_seen: Mapped[str] = mapped_column(Text, nullable=False)
    last_seen: Mapped[str] = mapped_column(Text, nullable=False)

    out_edges: Mapped[list["KGEdge"]] = relationship(
        "KGEdge", foreign_keys="KGEdge.source_id", back_populates="source_node", cascade="all, delete-orphan"
    )
    in_edges: Mapped[list["KGEdge"]] = relationship(
        "KGEdge", foreign_keys="KGEdge.target_id", back_populates="target_node", cascade="all, delete-orphan"
    )


class KGEdge(Base, UUIDMixin, TimestampMixin):
    """A directed relationship edge between two KGNodes."""
    __tablename__ = "kg_edges"
    __table_args__ = (
        UniqueConstraint("workspace_id", "source_id", "target_id", "relation", name="uq_kg_edge"),
    )

    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    source_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("kg_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    target_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("kg_nodes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    relation: Mapped[str] = mapped_column(Text, nullable=False)
    weight: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    confidence: Mapped[float] = mapped_column(Float, nullable=False, default=0.5)
    first_seen: Mapped[str] = mapped_column(Text, nullable=False)
    last_seen: Mapped[str] = mapped_column(Text, nullable=False)

    source_node: Mapped["KGNode"] = relationship("KGNode", foreign_keys=[source_id], back_populates="out_edges")
    target_node: Mapped["KGNode"] = relationship("KGNode", foreign_keys=[target_id], back_populates="in_edges")
