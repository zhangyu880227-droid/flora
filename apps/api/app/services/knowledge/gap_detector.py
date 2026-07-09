"""
Knowledge Gap Detector.

Analyses the Knowledge Graph and document collection to find three types of gaps:

1. Orphan references  — entities referenced in relationships but with no KGNode.
2. Stale high-value   — KGNodes with high doc_count but no new docs in N days.
3. Low-confidence hub — nodes that are central (many edges) but source docs have
                        low average confidence_score.

Each gap is converted to a research task and saved to .flora/tasks.json.
"""
from __future__ import annotations

import hashlib
import json
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge import KGEdge, KGNode, KnowledgeDocument


@dataclass
class ResearchGap:
    entity: str
    entity_type: str
    gap_type: str          # orphan_reference | stale_coverage | low_confidence_hub
    description: str
    suggested_query: str
    priority: int          # 1–5, lower = higher priority


class GapDetector:

    def __init__(self, flora_dir: Path | None = None) -> None:
        self.flora_dir = flora_dir or _default_flora_dir()

    async def detect(
        self,
        workspace_id: uuid.UUID,
        db: AsyncSession,
        stale_days: int = 7,
        min_doc_count: int = 3,
        low_confidence_threshold: float = 0.5,
    ) -> list[ResearchGap]:
        gaps: list[ResearchGap] = []

        gaps += await self._orphan_references(workspace_id, db)
        gaps += await self._stale_high_value(workspace_id, db, stale_days, min_doc_count)
        gaps += await self._low_confidence_hubs(workspace_id, db, low_confidence_threshold)

        self._save_tasks(gaps)
        return gaps

    # ── gap detection strategies ──────────────────────────────────────────────

    async def _orphan_references(
        self,
        workspace_id: uuid.UUID,
        db: AsyncSession,
    ) -> list[ResearchGap]:
        """Find labels referenced in relationship `to/from` fields that have no KGNode."""
        # Collect all edge target/source labels
        edges_result = await db.execute(
            select(KGEdge).where(KGEdge.workspace_id == workspace_id)
        )
        edges = edges_result.scalars().all()
        if not edges:
            return []

        node_result = await db.execute(
            select(KGNode.label).where(KGNode.workspace_id == workspace_id)
        )
        known_labels = {row[0] for row in node_result.all()}

        # Collect referenced labels from edge relations (node IDs exist, but the original
        # text labels for entities that appear ONLY as rel targets may be missing)
        # Here we look at document relationships for labels not in known_labels
        docs_result = await db.execute(
            select(KnowledgeDocument.relationships).where(
                KnowledgeDocument.workspace_id == workspace_id,
                KnowledgeDocument.status == "ready",
            )
        )

        orphan_counts: dict[str, int] = {}
        for (rels,) in docs_result.all():
            for rel in (rels or []):
                for key in ("from", "to"):
                    label = str(rel.get(key, "")).strip().lower()
                    if label and label not in known_labels:
                        orphan_counts[label] = orphan_counts.get(label, 0) + 1

        # Only surface orphans mentioned multiple times (higher signal)
        gaps: list[ResearchGap] = []
        for label, count in sorted(orphan_counts.items(), key=lambda x: -x[1])[:10]:
            if count < 2:
                continue
            gaps.append(ResearchGap(
                entity=label,
                entity_type="unknown",
                gap_type="orphan_reference",
                description=(
                    f'"{label}" is referenced {count} times in relationships '
                    f"but has no dedicated knowledge coverage."
                ),
                suggested_query=f"{label} overview research",
                priority=2,
            ))
        return gaps

    async def _stale_high_value(
        self,
        workspace_id: uuid.UUID,
        db: AsyncSession,
        stale_days: int,
        min_doc_count: int,
    ) -> list[ResearchGap]:
        """Find high-frequency entities whose source documents are all older than N days."""
        cutoff = (datetime.now(tz=timezone.utc) - timedelta(days=stale_days)).isoformat()

        # High-value nodes
        nodes_result = await db.execute(
            select(KGNode).where(
                KGNode.workspace_id == workspace_id,
                KGNode.doc_count >= min_doc_count,
            ).order_by(KGNode.doc_count.desc()).limit(50)
        )
        nodes = nodes_result.scalars().all()

        gaps: list[ResearchGap] = []
        for node in nodes:
            # Check if any document mentioning this entity was collected recently
            recent_result = await db.execute(
                select(func.count(KnowledgeDocument.id)).where(
                    KnowledgeDocument.workspace_id == workspace_id,
                    KnowledgeDocument.collected_at >= cutoff,
                    KnowledgeDocument.status == "ready",
                    KnowledgeDocument.entities.contains(  # type: ignore[attr-defined]
                        [{"name": node.label}]
                    ),
                )
            )
            recent_count = recent_result.scalar() or 0
            if recent_count == 0:
                gaps.append(ResearchGap(
                    entity=node.label,
                    entity_type=node.entity_type,
                    gap_type="stale_coverage",
                    description=(
                        f'"{node.label}" has {node.doc_count} documents but none '
                        f"collected in the last {stale_days} days."
                    ),
                    suggested_query=f"{node.label} latest news {datetime.now(tz=timezone.utc).year}",
                    priority=3,
                ))

        return gaps[:8]

    async def _low_confidence_hubs(
        self,
        workspace_id: uuid.UUID,
        db: AsyncSession,
        threshold: float,
    ) -> list[ResearchGap]:
        """Find nodes with many edges (high centrality) but low average confidence."""
        # Count outgoing + incoming edges per node
        out_result = await db.execute(
            select(KGEdge.source_id, func.count(KGEdge.id).label("cnt"))
            .where(KGEdge.workspace_id == workspace_id)
            .group_by(KGEdge.source_id)
            .having(func.count(KGEdge.id) >= 3)
        )
        degree_map: dict[uuid.UUID, int] = {row[0]: row[1] for row in out_result.all()}

        if not degree_map:
            return []

        nodes_result = await db.execute(
            select(KGNode).where(
                KGNode.workspace_id == workspace_id,
                KGNode.id.in_(list(degree_map.keys())),
            )
        )
        nodes = nodes_result.scalars().all()

        gaps: list[ResearchGap] = []
        for node in sorted(nodes, key=lambda n: -degree_map.get(n.id, 0)):
            avg_relevance = (
                node.total_relevance / node.doc_count if node.doc_count else 0
            )
            if avg_relevance < threshold:
                degree = degree_map.get(node.id, 0)
                gaps.append(ResearchGap(
                    entity=node.label,
                    entity_type=node.entity_type,
                    gap_type="low_confidence_hub",
                    description=(
                        f'"{node.label}" is a central hub ({degree} relationships) '
                        f"but has low knowledge confidence ({avg_relevance:.2f})."
                    ),
                    suggested_query=f"{node.label} in-depth analysis",
                    priority=4,
                ))

        return gaps[:5]

    # ── task persistence ──────────────────────────────────────────────────────

    def _save_tasks(self, gaps: list[ResearchGap]) -> None:
        if not gaps:
            return

        tasks_path = self.flora_dir / "tasks.json"
        existing: list[dict] = []
        if tasks_path.exists():
            try:
                raw = json.loads(tasks_path.read_text())
                existing = raw.get("tasks", []) if isinstance(raw, dict) else raw
            except (json.JSONDecodeError, OSError):
                pass

        now = datetime.now(tz=timezone.utc).isoformat()
        existing_ids = {str(t.get("id")) for t in existing}

        additions: list[dict] = []
        for gap in gaps:
            task_id = _gap_id(gap)
            if task_id in existing_ids:
                continue
            additions.append({
                "id": task_id,
                "title": f"Research: {gap.entity}",
                "description": gap.description,
                "category": "knowledge_gap",
                "priority": gap.priority,
                "score": float(6 - gap.priority),
                "impact": "medium",
                "effort": "low",
                "status": "pending",
                "source": "knowledge-gap",
                "gap_type": gap.gap_type,
                "suggested_query": gap.suggested_query,
                "entity": gap.entity,
                "entity_type": gap.entity_type,
                "files": [],
                "finding_ids": [],
                "acceptance_criteria": [f"Collect ≥3 new documents covering '{gap.entity}'"],
                "analyzer": "gap_detector",
                "dependencies": [],
                "created_at": now,
                "updated_at": now,
            })

        output = {
            "project": "Flora",
            "description": "Managed by Flora Self-Improvement Engine",
            "generated_at": now,
            "tasks": existing + additions,
        }
        tasks_path.write_text(json.dumps(output, indent=2, default=str))


# ── helpers ───────────────────────────────────────────────────────────────────

def _gap_id(gap: ResearchGap) -> str:
    key = f"gap-{gap.gap_type}-{gap.entity}"
    return "gap-" + hashlib.sha1(key.encode()).hexdigest()[:8]


def _default_flora_dir() -> Path:
    """Walk up to find the monorepo root, then return .flora/."""
    current = Path(__file__).resolve().parent
    for _ in range(10):
        if (current / "turbo.json").exists() or (current / "pnpm-workspace.yaml").exists():
            return current / ".flora"
        current = current.parent
    return Path(__file__).resolve().parents[5] / ".flora"
