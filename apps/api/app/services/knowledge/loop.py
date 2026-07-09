"""
Flora Self-Improvement Loop — master orchestrator.

On each 30-minute cycle, for every workspace:
  1. Clean up any stale (crashed) ingestion runs
  2. Collect new knowledge from all active feeds
  3. Build / refresh the Knowledge Graph
  4. Detect knowledge gaps → write research tasks
  5. Append a Knowledge Intelligence section to ATLAS.md
"""
from __future__ import annotations

import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge import KGEdge, KGNode, KnowledgeDocument, KnowledgeFeed, KnowledgeIngestionRun
from app.services.knowledge.gap_detector import GapDetector, ResearchGap
from app.services.knowledge.graph import GraphStats, KnowledgeGraphBuilder
from app.services.knowledge.pipeline import RunResult, run_workspace

logger = logging.getLogger(__name__)

STALE_RUN_MINUTES = 15


@dataclass
class LoopResult:
    workspace_id: str
    started_at: str
    completed_at: str
    stale_runs_recovered: int = 0
    feeds_processed: int = 0
    documents_new: int = 0
    documents_skipped: int = 0
    graph: GraphStats = field(default_factory=GraphStats)
    gaps_detected: int = 0
    errors: list[str] = field(default_factory=list)


class SelfImprovementLoop:

    def __init__(self, flora_dir: Path | None = None) -> None:
        self.flora_dir = flora_dir or _default_flora_dir()
        self.graph_builder = KnowledgeGraphBuilder()
        self.gap_detector = GapDetector(flora_dir=self.flora_dir)

    async def run(self, workspace_id: uuid.UUID, db: AsyncSession) -> LoopResult:
        started = datetime.now(tz=timezone.utc)
        result = LoopResult(
            workspace_id=str(workspace_id),
            started_at=started.isoformat(),
            completed_at="",
        )

        # ── 1. Resume stale ingestion runs ────────────────────────────────────
        result.stale_runs_recovered = await self._recover_stale_runs(workspace_id, db)

        # ── 2. Collect new knowledge from all feeds ───────────────────────────
        try:
            run_results: list[RunResult] = await run_workspace(workspace_id, db)
            result.feeds_processed = len(run_results)
            result.documents_new = sum(r.documents_new for r in run_results)
            result.documents_skipped = sum(r.documents_skipped for r in run_results)
            logger.info(
                "[loop] workspace=%s feeds=%d new=%d skipped=%d",
                workspace_id, result.feeds_processed, result.documents_new, result.documents_skipped,
            )
        except Exception as exc:
            result.errors.append(f"collection: {exc}")
            logger.exception("[loop] collection failed for workspace=%s", workspace_id)

        # ── 3. Build / refresh Knowledge Graph ───────────────────────────────
        try:
            result.graph = await self.graph_builder.build(workspace_id, db)
            logger.info(
                "[loop] graph: nodes=%d edges=%d (+%d/+%d created)",
                result.graph.node_count, result.graph.edge_count,
                result.graph.nodes_created, result.graph.edges_created,
            )
        except Exception as exc:
            result.errors.append(f"graph_build: {exc}")
            logger.exception("[loop] graph build failed for workspace=%s", workspace_id)

        # ── 4. Detect knowledge gaps ──────────────────────────────────────────
        try:
            gaps: list[ResearchGap] = await self.gap_detector.detect(workspace_id, db)
            result.gaps_detected = len(gaps)
            logger.info("[loop] %d knowledge gaps detected", result.gaps_detected)
        except Exception as exc:
            result.errors.append(f"gap_detect: {exc}")
            logger.exception("[loop] gap detection failed for workspace=%s", workspace_id)
            gaps = []

        # ── 5. Update Atlas with Knowledge Intelligence section ───────────────
        try:
            await self._update_atlas(workspace_id, db, result, gaps)
        except Exception as exc:
            result.errors.append(f"atlas_update: {exc}")
            logger.exception("[loop] atlas update failed for workspace=%s", workspace_id)

        result.completed_at = datetime.now(tz=timezone.utc).isoformat()
        return result

    # ── implementation details ────────────────────────────────────────────────

    async def _recover_stale_runs(
        self,
        workspace_id: uuid.UUID,
        db: AsyncSession,
    ) -> int:
        cutoff = (datetime.now(tz=timezone.utc) - timedelta(minutes=STALE_RUN_MINUTES)).isoformat()
        stale_result = await db.execute(
            select(KnowledgeIngestionRun).where(
                KnowledgeIngestionRun.workspace_id == workspace_id,
                KnowledgeIngestionRun.status == "running",
                KnowledgeIngestionRun.started_at < cutoff,
            )
        )
        stale_runs = stale_result.scalars().all()
        now = datetime.now(tz=timezone.utc).isoformat()
        for run in stale_runs:
            run.status = "failed"
            run.completed_at = now
            run.error_message = f"Stale run recovered by loop (no completion after {STALE_RUN_MINUTES}min)"
        if stale_runs:
            await db.commit()
            logger.info("[loop] recovered %d stale ingestion runs", len(stale_runs))
        return len(stale_runs)

    async def _update_atlas(
        self,
        workspace_id: uuid.UUID,
        db: AsyncSession,
        loop_result: LoopResult,
        gaps: list[ResearchGap],
    ) -> None:
        """Append / replace a Knowledge Intelligence section in ATLAS.md."""
        atlas_md_path = self.flora_dir.parent / "ATLAS.md"
        if not atlas_md_path.exists():
            return

        now_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

        # Gather stats from DB
        total_docs = await db.scalar(
            select(func.count(KnowledgeDocument.id)).where(
                KnowledgeDocument.workspace_id == workspace_id,
                KnowledgeDocument.status == "ready",
            )
        ) or 0

        today_iso = (datetime.now(tz=timezone.utc) - timedelta(hours=24)).isoformat()
        docs_today = await db.scalar(
            select(func.count(KnowledgeDocument.id)).where(
                KnowledgeDocument.workspace_id == workspace_id,
                KnowledgeDocument.status == "ready",
                KnowledgeDocument.collected_at >= today_iso,
            )
        ) or 0

        active_feeds = await db.scalar(
            select(func.count(KnowledgeFeed.id)).where(
                KnowledgeFeed.workspace_id == workspace_id,
                KnowledgeFeed.is_active == True,  # noqa: E712
            )
        ) or 0

        # Top entities by doc_count
        top_nodes_result = await db.execute(
            select(KGNode.label, KGNode.entity_type, KGNode.doc_count)
            .where(KGNode.workspace_id == workspace_id)
            .order_by(KGNode.doc_count.desc())
            .limit(10)
        )
        top_nodes = top_nodes_result.all()

        # Build the knowledge section
        section_lines = [
            "",
            "---",
            "",
            "## Knowledge Intelligence",
            f"_Last loop: {now_str}_",
            "",
            "### Collection Stats",
            "",
            "| Metric | Value |",
            "|---|---|",
            f"| Total documents | {total_docs} |",
            f"| Collected last 24h | {docs_today} |",
            f"| Active feeds | {active_feeds} |",
            f"| Graph nodes | {loop_result.graph.node_count} |",
            f"| Graph edges | {loop_result.graph.edge_count} |",
            f"| Gaps detected | {loop_result.gaps_detected} |",
            "",
        ]

        if top_nodes:
            section_lines += [
                "### Top Entities by Coverage",
                "",
                "| Entity | Type | Documents |",
                "|---|---|---|",
            ]
            for label, etype, cnt in top_nodes:
                section_lines.append(f"| {label} | {etype} | {cnt} |")
            section_lines.append("")

        if gaps:
            section_lines += [
                "### Knowledge Gaps (pending research tasks)",
                "",
            ]
            for gap in gaps[:6]:
                section_lines.append(
                    f"- **{gap.entity}** ({gap.gap_type.replace('_', ' ')}) — {gap.description[:80]}"
                )
            section_lines.append("")

        # Read current ATLAS.md and strip any old knowledge section before appending
        current = atlas_md_path.read_text()
        marker = "\n---\n\n## Knowledge Intelligence"
        if marker in current:
            current = current[: current.index(marker)]

        atlas_md_path.write_text(current + "\n".join(section_lines))


# ── helpers ───────────────────────────────────────────────────────────────────

def _default_flora_dir() -> Path:
    current = Path(__file__).resolve().parent
    for _ in range(10):
        if (current / "turbo.json").exists() or (current / "pnpm-workspace.yaml").exists():
            return current / ".flora"
        current = current.parent
    return Path(__file__).resolve().parents[5] / ".flora"
