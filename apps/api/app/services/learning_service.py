"""Automatic Learning Service — connects the Knowledge Pipeline to Memory + KG.

Flow per workspace:
  1. Fetch recently-processed KnowledgeDocuments (status=ready, since last job)
  2. For each document:
     a. Create a Memory (type=document) with the summary
     b. Create Memory entries (type=semantic) for each extracted entity
     c. Link entities to KG via KGService.link_memory_entities
  3. Record a LearningJob with stats

Relies on existing:
  - KnowledgeDocument (models/knowledge.py)
  - Memory / MemoryRepository (models/memory.py + repositories/memory.py)
  - KGService (services/knowledge/kg_service.py)
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.knowledge import KnowledgeDocument
from app.models.learning import LearningJob
from app.models.memory import Memory, MemoryType
from app.models.workspace import Workspace

log = get_logger(__name__)

# Default look-back window when there is no previous job
DEFAULT_LOOKBACK_HOURS = 24


class LearningService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    async def run_for_workspace(self, workspace_id: uuid.UUID) -> LearningJob:
        """Run the learn cycle for a workspace. Returns the LearningJob record."""
        job = LearningJob(workspace_id=workspace_id, trigger="scheduled", status="running")
        self._db.add(job)
        await self._db.flush()

        try:
            stats = await self._learn(workspace_id)
            job.status = "completed"
            job.documents_scanned = stats["documents_scanned"]
            job.memories_created = stats["memories_created"]
            job.kg_nodes_updated = stats["kg_nodes_updated"]
            job.summary = stats
        except Exception as exc:
            log.exception(
                "learning.job_failed",
                extra={"workspace_id": str(workspace_id), "error": str(exc)},
            )
            job.status = "failed"
            job.error_message = str(exc)

        await self._db.flush()
        return job

    async def list_jobs(
        self, workspace_id: uuid.UUID, limit: int = 20
    ) -> list[LearningJob]:
        result = await self._db.execute(
            select(LearningJob)
            .where(LearningJob.workspace_id == workspace_id)
            .order_by(LearningJob.created_at.desc())
            .limit(limit)
        )
        return list(result.scalars().all())

    async def _learn(self, workspace_id: uuid.UUID) -> dict:
        """Core learning pipeline."""
        from app.services.knowledge.kg_service import KGService
        from app.repositories.memory import MemoryRepository

        memory_repo = MemoryRepository(self._db)
        kg_svc = KGService(self._db)

        # Find recently processed documents since last learning job
        since = await self._last_job_time(workspace_id)
        docs = await self._get_recent_docs(workspace_id, since)

        memories_created = 0
        kg_nodes_updated = 0

        # Memories require a real user_id; use the workspace owner
        owner_id = await self._get_owner_id(workspace_id)

        for doc in docs:
            # 1. Document-level Memory (summary)
            if doc.summary:
                existing = await memory_repo.get_by_key(
                    workspace_id, owner_id, MemoryType.document, f"doc:{doc.id}"
                )
                if not existing:
                    await memory_repo.create(
                        workspace_id=workspace_id,
                        user_id=owner_id,
                        memory_type=MemoryType.document,
                        content=doc.summary,
                        key=f"doc:{doc.id}",
                        importance="0.5",
                        access_count=0,
                        meta={"source_id": str(doc.id), "title": doc.title, "url": doc.url},
                    )
                    memories_created += 1

            # 2. Semantic Memory + KG for extracted entities
            entities = [
                e.get("name", "") for e in (doc.entities or []) if e.get("name")
            ]
            if entities:
                # Create a transient Memory to act as the link anchor
                mem = Memory(
                    workspace_id=workspace_id,
                    user_id=owner_id,
                    memory_type=MemoryType.semantic,
                    content=f"Entities from: {doc.title}",
                    key=f"entities:{doc.id}",
                    importance="0.4",
                    access_count=0,
                    meta={"doc_id": str(doc.id)},
                )
                self._db.add(mem)
                await self._db.flush()
                memories_created += 1

                nodes = await kg_svc.link_memory_entities(
                    workspace_id, mem, entities[:20], "concept"
                )
                kg_nodes_updated += len(nodes)

        return {
            "documents_scanned": len(docs),
            "memories_created": memories_created,
            "kg_nodes_updated": kg_nodes_updated,
            "since": since.isoformat(),
        }

    async def _get_owner_id(self, workspace_id: uuid.UUID) -> uuid.UUID:
        result = await self._db.execute(
            select(Workspace.owner_id).where(Workspace.id == workspace_id)
        )
        return result.scalar_one()

    async def _last_job_time(self, workspace_id: uuid.UUID) -> datetime:
        result = await self._db.execute(
            select(LearningJob)
            .where(
                LearningJob.workspace_id == workspace_id,
                LearningJob.status == "completed",
            )
            .order_by(LearningJob.created_at.desc())
            .limit(1)
        )
        last = result.scalar_one_or_none()
        if last:
            return last.created_at.replace(tzinfo=timezone.utc)
        return datetime.now(timezone.utc) - timedelta(hours=DEFAULT_LOOKBACK_HOURS)

    async def _get_recent_docs(
        self, workspace_id: uuid.UUID, since: datetime
    ) -> list[KnowledgeDocument]:
        result = await self._db.execute(
            select(KnowledgeDocument)
            .where(
                KnowledgeDocument.workspace_id == workspace_id,
                KnowledgeDocument.status == "ready",
                KnowledgeDocument.created_at >= since,
            )
            .order_by(KnowledgeDocument.importance_score.desc())
            .limit(100)
        )
        return list(result.scalars().all())
