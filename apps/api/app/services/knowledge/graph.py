"""
Knowledge Graph builder.

Reads all KnowledgeDocuments in a workspace, aggregates extracted entities
and relationships into KGNode / KGEdge rows, and returns summary stats.

The graph is rebuilt incrementally on each loop cycle:
- Existing nodes/edges are updated (doc_count, weight, last_seen)
- New nodes/edges are inserted
- No deletions — stale nodes fade naturally via doc_count decay
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select, text
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge import KGEdge, KGNode, KnowledgeDocument


@dataclass
class GraphStats:
    node_count: int = 0
    edge_count: int = 0
    nodes_created: int = 0
    nodes_updated: int = 0
    edges_created: int = 0
    edges_updated: int = 0
    duration_seconds: float = 0.0


class KnowledgeGraphBuilder:

    async def build(self, workspace_id: uuid.UUID, db: AsyncSession) -> GraphStats:
        started = datetime.now(tz=timezone.utc)
        now = started.isoformat()
        stats = GraphStats()

        # ── Step 1: load all documents with entity/relationship data ──────────
        result = await db.execute(
            select(KnowledgeDocument).where(
                KnowledgeDocument.workspace_id == workspace_id,
                KnowledgeDocument.status == "ready",
            )
        )
        docs = list(result.scalars().all())

        if not docs:
            return stats

        # ── Step 2: aggregate entity stats across all documents ───────────────
        entity_stats: dict[tuple[str, str], dict] = {}
        for doc in docs:
            for ent in (doc.entities or []):
                name = str(ent.get("name", "")).strip().lower()
                etype = str(ent.get("type", "concept")).strip()
                if not name:
                    continue
                key = (name, etype)
                if key not in entity_stats:
                    entity_stats[key] = {"doc_count": 0, "total_relevance": 0.0}
                entity_stats[key]["doc_count"] += 1
                entity_stats[key]["total_relevance"] += float(ent.get("relevance", 0.5))

        # ── Step 3: load existing nodes for this workspace ─────────────────────
        existing_result = await db.execute(
            select(KGNode).where(KGNode.workspace_id == workspace_id)
        )
        existing_nodes: dict[tuple[str, str], KGNode] = {
            (n.label, n.entity_type): n
            for n in existing_result.scalars().all()
        }

        # ── Step 4: upsert nodes ───────────────────────────────────────────────
        node_map: dict[tuple[str, str], uuid.UUID] = {}

        for (label, etype), agg in entity_stats.items():
            node = existing_nodes.get((label, etype))
            if node:
                node.doc_count = agg["doc_count"]
                node.total_relevance = round(agg["total_relevance"], 4)
                node.last_seen = now
                stats.nodes_updated += 1
            else:
                node = KGNode(
                    workspace_id=workspace_id,
                    label=label,
                    entity_type=etype,
                    doc_count=agg["doc_count"],
                    total_relevance=round(agg["total_relevance"], 4),
                    first_seen=now,
                    last_seen=now,
                )
                db.add(node)
                await db.flush()  # get node.id before edge insertion
                stats.nodes_created += 1

            node_map[(label, etype)] = node.id

        await db.flush()

        # ── Step 5: aggregate relationship stats ──────────────────────────────
        # Map: (src_id, tgt_id, relation) → (count, sum_confidence)
        rel_stats: dict[tuple[uuid.UUID, uuid.UUID, str], tuple[int, float]] = {}
        for doc in docs:
            for rel in (doc.relationships or []):
                src_label = str(rel.get("from", "")).strip().lower()
                tgt_label = str(rel.get("to", "")).strip().lower()
                relation = str(rel.get("relation", "")).strip()
                if not (src_label and tgt_label and relation):
                    continue

                # Resolve node IDs from any matching (label, *) key
                src_id = _find_node_id(src_label, node_map)
                tgt_id = _find_node_id(tgt_label, node_map)
                if not (src_id and tgt_id) or src_id == tgt_id:
                    continue

                conf = float(rel.get("confidence", 0.7))
                key = (src_id, tgt_id, relation)
                prev_count, prev_conf = rel_stats.get(key, (0, 0.0))
                rel_stats[key] = (prev_count + 1, prev_conf + conf)

        # ── Step 6: load existing edges ────────────────────────────────────────
        existing_edges_result = await db.execute(
            select(KGEdge).where(KGEdge.workspace_id == workspace_id)
        )
        existing_edges: dict[tuple[uuid.UUID, uuid.UUID, str], KGEdge] = {
            (e.source_id, e.target_id, e.relation): e
            for e in existing_edges_result.scalars().all()
        }

        # ── Step 7: upsert edges ───────────────────────────────────────────────
        for (src_id, tgt_id, relation), (weight, sum_conf) in rel_stats.items():
            avg_confidence = round(sum_conf / weight, 4) if weight else 0.5
            edge = existing_edges.get((src_id, tgt_id, relation))
            if edge:
                edge.weight = weight
                edge.confidence = avg_confidence
                edge.last_seen = now
                stats.edges_updated += 1
            else:
                db.add(KGEdge(
                    workspace_id=workspace_id,
                    source_id=src_id,
                    target_id=tgt_id,
                    relation=relation,
                    weight=weight,
                    confidence=avg_confidence,
                    first_seen=now,
                    last_seen=now,
                ))
                stats.edges_created += 1

        await db.commit()

        stats.node_count = len(node_map)
        stats.edge_count = len(rel_stats)  # edge_count = unique (src, tgt, relation) triples
        stats.duration_seconds = (datetime.now(tz=timezone.utc) - started).total_seconds()
        return stats


def _find_node_id(
    label: str,
    node_map: dict[tuple[str, str], uuid.UUID],
) -> uuid.UUID | None:
    """Return node ID for a label (any entity_type)."""
    for (l, _), nid in node_map.items():
        if l == label:
            return nid
    return None
