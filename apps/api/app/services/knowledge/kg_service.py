"""Knowledge Graph query service — higher-level operations on top of KGNode / KGEdge.

Provides neighbor traversal, label search, node merging (deduplication), and
memory-to-KG linking. Used by API endpoints and the Memory Engine.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.knowledge import KGEdge, KGNode
from app.models.memory import Memory

log = get_logger(__name__)


class KGService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── Node search ────────────────────────────────────────────────────────

    async def search_nodes(
        self,
        workspace_id: uuid.UUID,
        query: str,
        *,
        entity_type: str | None = None,
        limit: int = 20,
    ) -> list[KGNode]:
        """Case-insensitive label search."""
        filters = [
            KGNode.workspace_id == workspace_id,
            KGNode.label.ilike(f"%{query}%"),
        ]
        if entity_type:
            filters.append(KGNode.entity_type == entity_type)
        result = await self._db.execute(
            select(KGNode)
            .where(*filters)
            .order_by(KGNode.doc_count.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    # ── Neighbor traversal ─────────────────────────────────────────────────

    async def get_neighbors(
        self,
        workspace_id: uuid.UUID,
        node_id: uuid.UUID,
        *,
        hops: int = 1,
        max_nodes: int = 50,
    ) -> dict:
        """Return a 1-hop (or 2-hop) subgraph centred on node_id.

        Returns {"nodes": [...], "edges": [...]} suitable for graph rendering.
        """
        # Edges where node is source or target
        edge_result = await self._db.execute(
            select(KGEdge)
            .where(
                KGEdge.workspace_id == workspace_id,
                (KGEdge.source_id == node_id) | (KGEdge.target_id == node_id),
            )
            .order_by(KGEdge.weight.desc())
            .limit(max_nodes)
        )
        edges = list(edge_result.scalars().all())

        neighbor_ids: set[uuid.UUID] = {node_id}
        for e in edges:
            neighbor_ids.add(e.source_id)
            neighbor_ids.add(e.target_id)

        if hops == 2 and len(neighbor_ids) < max_nodes:
            # Expand one more hop
            second_hop_result = await self._db.execute(
                select(KGEdge)
                .where(
                    KGEdge.workspace_id == workspace_id,
                    (KGEdge.source_id.in_(neighbor_ids)) | (KGEdge.target_id.in_(neighbor_ids)),
                )
                .order_by(KGEdge.weight.desc())
                .limit(max_nodes * 2)
            )
            for e in second_hop_result.scalars().all():
                edges.append(e)
                neighbor_ids.add(e.source_id)
                neighbor_ids.add(e.target_id)
                if len(neighbor_ids) >= max_nodes:
                    break

        node_result = await self._db.execute(
            select(KGNode).where(KGNode.id.in_(neighbor_ids))
        )
        nodes = list(node_result.scalars().all())

        # Deduplicate edges
        seen_edges: set[uuid.UUID] = set()
        unique_edges = []
        for e in edges:
            if e.id not in seen_edges:
                seen_edges.add(e.id)
                unique_edges.append(e)

        return {"nodes": nodes, "edges": unique_edges}

    # ── Node merging (deduplication) ───────────────────────────────────────

    async def merge_nodes(
        self,
        workspace_id: uuid.UUID,
        source_node_ids: list[uuid.UUID],
        target_label: str,
        entity_type: str,
    ) -> KGNode:
        """Merge multiple source nodes into one canonical node.

        - Sums doc_count + total_relevance across sources.
        - Re-points edges from all source nodes to the merged node.
        - Deletes the source nodes (cascade deletes old edges, so re-point first).
        """
        now = datetime.now(timezone.utc).isoformat()

        # Collect source node stats
        result = await self._db.execute(
            select(KGNode).where(
                KGNode.workspace_id == workspace_id,
                KGNode.id.in_(source_node_ids),
            )
        )
        sources = list(result.scalars().all())
        if not sources:
            raise ValueError("No source nodes found")

        merged_doc_count = sum(s.doc_count for s in sources)
        merged_relevance = sum(s.total_relevance for s in sources)
        first_seen = min(s.first_seen for s in sources)

        # Create or get the merged node
        stmt = pg_insert(KGNode).values(
            workspace_id=workspace_id,
            label=target_label.strip().lower(),
            entity_type=entity_type,
            doc_count=merged_doc_count,
            total_relevance=merged_relevance,
            first_seen=first_seen,
            last_seen=now,
        ).on_conflict_do_update(
            index_elements=["workspace_id", "label", "entity_type"],
            set_={
                "doc_count": func.greatest(KGNode.doc_count, merged_doc_count),
                "total_relevance": func.greatest(KGNode.total_relevance, merged_relevance),
                "last_seen": now,
            },
        ).returning(KGNode)
        merged = (await self._db.execute(stmt)).scalar_one()

        # Re-point all edges from source nodes → merged node
        for src in sources:
            if src.id == merged.id:
                continue
            await self._db.execute(
                update(KGEdge)
                .where(KGEdge.source_id == src.id)
                .values(source_id=merged.id)
            )
            await self._db.execute(
                update(KGEdge)
                .where(KGEdge.target_id == src.id)
                .values(target_id=merged.id)
            )
            await self._db.delete(src)

        await self._db.flush()
        log.info(
            "kg.merge_nodes",
            extra={"merged_into": str(merged.id), "sources": len(sources)},
        )
        return merged

    # ── Memory → KG linking ────────────────────────────────────────────────

    async def link_memory_entities(
        self,
        workspace_id: uuid.UUID,
        memory: Memory,
        entity_labels: list[str],
        entity_type: str = "concept",
    ) -> list[KGNode]:
        """Ensure each entity_label has a KGNode and update meta on the memory."""
        now = datetime.now(timezone.utc).isoformat()
        nodes: list[KGNode] = []

        for label in entity_labels:
            label_norm = label.strip().lower()
            if not label_norm:
                continue
            stmt = pg_insert(KGNode).values(
                workspace_id=workspace_id,
                label=label_norm,
                entity_type=entity_type,
                doc_count=1,
                total_relevance=0.5,
                first_seen=now,
                last_seen=now,
            ).on_conflict_do_update(
                index_elements=["workspace_id", "label", "entity_type"],
                set_={"doc_count": KGNode.doc_count + 1, "last_seen": now},
            ).returning(KGNode)
            node = (await self._db.execute(stmt)).scalar_one()
            nodes.append(node)

        # Store linked node IDs in memory meta
        if nodes:
            existing_meta = memory.meta or {}
            kg_ids = existing_meta.get("kg_node_ids", [])
            for n in nodes:
                nid = str(n.id)
                if nid not in kg_ids:
                    kg_ids.append(nid)
            memory.meta = {**existing_meta, "kg_node_ids": kg_ids}
            await self._db.flush()

        return nodes
