"""knowledge enrichment: importance_score on documents, confidence on kg_edges, sec_edgar source type

Revision ID: d8f2a4c91e07
Revises: c4a1d8e52b93
Create Date: 2026-07-09 00:00:00.000000
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "d8f2a4c91e07"
down_revision = "c4a1d8e52b93"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add importance_score to knowledge_documents
    op.add_column(
        "knowledge_documents",
        sa.Column("importance_score", sa.Float(), nullable=False, server_default="0.5"),
    )

    # Add confidence to kg_edges (float, higher = more evidence)
    op.add_column(
        "kg_edges",
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.5"),
    )

    # Index for fetching high-importance documents first
    op.create_index(
        "ix_knowledge_documents_importance",
        "knowledge_documents",
        ["workspace_id", "importance_score"],
    )


def downgrade() -> None:
    op.drop_index("ix_knowledge_documents_importance", table_name="knowledge_documents")
    op.drop_column("knowledge_documents", "importance_score")
    op.drop_column("kg_edges", "confidence")
