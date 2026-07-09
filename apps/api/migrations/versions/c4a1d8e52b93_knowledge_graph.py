"""knowledge_graph — kg_nodes and kg_edges tables

Revision ID: c4a1d8e52b93
Revises: ac93fb51fadf
Create Date: 2026-07-09 14:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c4a1d8e52b93"
down_revision: Union[str, None] = "ac93fb51fadf"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "kg_nodes",
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("entity_type", sa.String(length=50), nullable=False),
        sa.Column("doc_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_relevance", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("first_seen", sa.Text(), nullable=False),
        sa.Column("last_seen", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "label", "entity_type", name="uq_kg_node"),
    )
    op.create_index("ix_kg_nodes_workspace_id", "kg_nodes", ["workspace_id"])
    op.create_index("ix_kg_nodes_entity_type", "kg_nodes", ["entity_type"])
    op.create_index("ix_kg_nodes_doc_count", "kg_nodes", ["doc_count"])

    op.create_table(
        "kg_edges",
        sa.Column("workspace_id", sa.UUID(), nullable=False),
        sa.Column("source_id", sa.UUID(), nullable=False),
        sa.Column("target_id", sa.UUID(), nullable=False),
        sa.Column("relation", sa.Text(), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("first_seen", sa.Text(), nullable=False),
        sa.Column("last_seen", sa.Text(), nullable=False),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["workspace_id"], ["workspaces.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_id"], ["kg_nodes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["target_id"], ["kg_nodes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("workspace_id", "source_id", "target_id", "relation", name="uq_kg_edge"),
    )
    op.create_index("ix_kg_edges_workspace_id", "kg_edges", ["workspace_id"])
    op.create_index("ix_kg_edges_source_id", "kg_edges", ["source_id"])
    op.create_index("ix_kg_edges_target_id", "kg_edges", ["target_id"])


def downgrade() -> None:
    op.drop_index("ix_kg_edges_target_id", table_name="kg_edges")
    op.drop_index("ix_kg_edges_source_id", table_name="kg_edges")
    op.drop_index("ix_kg_edges_workspace_id", table_name="kg_edges")
    op.drop_table("kg_edges")

    op.drop_index("ix_kg_nodes_doc_count", table_name="kg_nodes")
    op.drop_index("ix_kg_nodes_entity_type", table_name="kg_nodes")
    op.drop_index("ix_kg_nodes_workspace_id", table_name="kg_nodes")
    op.drop_table("kg_nodes")
