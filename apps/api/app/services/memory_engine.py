"""Memory Engine — auto-processes memories for the Flora AI OS.

Runs periodically (via Celery Beat) to:
1. Consolidate long conversation histories into compressed long-term memories
2. Auto-tag memories with a simple keyword classifier
3. Prune expired working-memory entries

Phase 4 skeleton: uses the LLM provider (same as ai.py) for summarization.
Embedding integration reserved for Phase 5 (pgvector on memory.embedding column).
"""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import get_logger
from app.models.memory import Memory, MemoryType
from app.repositories.memory import MemoryRepository

log = get_logger(__name__)

# Consolidate conversation memories older than this
CONVERSATION_CONSOLIDATION_AGE_HOURS = 6
# Minimum # of conversation memories before we try to consolidate
CONVERSATION_CONSOLIDATION_MIN = 5
# Maximum working memory TTL hours (older are pruned without LLM)
WORKING_MEMORY_MAX_AGE_HOURS = 4


class MemoryEngine:
    """Stateless engine that processes raw memories into structured knowledge."""

    def __init__(self, db: AsyncSession) -> None:
        self._repo = MemoryRepository(db)
        self._db = db

    # ── Public entry points ────────────────────────────────────────────────

    async def run_for_workspace(self, workspace_id: uuid.UUID) -> dict:
        """Run all memory processing steps for a workspace. Returns a summary dict."""
        log.info("memory_engine.start", extra={"workspace_id": str(workspace_id)})
        results: dict[str, int] = {"consolidated": 0, "pruned": 0, "tagged": 0}

        # 1. Prune stale working memories
        results["pruned"] = await self._prune_working_memories(workspace_id)

        # 2. Tag unclassified memories (set key if missing)
        results["tagged"] = await self._tag_unkeyed_memories(workspace_id)

        # 3. Consolidate conversation → long-term
        results["consolidated"] = await self._consolidate_conversations(workspace_id)

        log.info(
            "memory_engine.done",
            extra={"workspace_id": str(workspace_id), **results},
        )
        return results

    # ── Internal steps ─────────────────────────────────────────────────────

    async def _prune_working_memories(self, workspace_id: uuid.UUID) -> int:
        """Delete working memories older than WORKING_MEMORY_MAX_AGE_HOURS."""
        cutoff = datetime.now(timezone.utc) - timedelta(hours=WORKING_MEMORY_MAX_AGE_HOURS)
        old_memories = await self._repo.list_for_workspace(
            workspace_id, memory_type=MemoryType.working, limit=500
        )
        pruned = 0
        for m in old_memories:
            if m.created_at.replace(tzinfo=timezone.utc) < cutoff:
                await self._db.delete(m)
                pruned += 1
        if pruned:
            await self._db.flush()
        return pruned

    async def _tag_unkeyed_memories(self, workspace_id: uuid.UUID) -> int:
        """Assign auto-generated keys to memories that have none."""
        all_mem = await self._repo.list_for_workspace(workspace_id, limit=200)
        tagged = 0
        for m in all_mem:
            if m.key:
                continue
            auto_key = _auto_key(m)
            if auto_key:
                m.key = auto_key
                tagged += 1
        if tagged:
            await self._db.flush()
        return tagged

    async def _consolidate_conversations(self, workspace_id: uuid.UUID) -> int:
        """Summarize old conversation memories into a single long-term memory."""
        cutoff = datetime.now(timezone.utc) - timedelta(
            hours=CONVERSATION_CONSOLIDATION_AGE_HOURS
        )
        conv_memories = await self._repo.list_for_workspace(
            workspace_id, memory_type=MemoryType.conversation, limit=500
        )
        # Group by user_id
        by_user: dict[uuid.UUID, list[Memory]] = {}
        for m in conv_memories:
            if m.created_at.replace(tzinfo=timezone.utc) < cutoff:
                by_user.setdefault(m.user_id, []).append(m)

        consolidated = 0
        for user_id, memories in by_user.items():
            if len(memories) < CONVERSATION_CONSOLIDATION_MIN:
                continue
            summary = _summarize_locally(memories)
            await self._repo.create(
                workspace_id=workspace_id,
                user_id=user_id,
                memory_type=MemoryType.long_term,
                content=summary,
                key=f"auto_consolidation:{datetime.now(timezone.utc).date()}",
                importance="0.6",
                access_count=0,
                meta={"source": "memory_engine", "consolidated_count": len(memories)},
            )
            for m in memories:
                await self._db.delete(m)
            consolidated += len(memories)

        if consolidated:
            await self._db.flush()
        return consolidated


# ── Helpers ────────────────────────────────────────────────────────────────

def _auto_key(memory: Memory) -> str | None:
    """Generate a coarse key from the first few words of content."""
    words = memory.content.strip().split()[:6]
    if not words:
        return None
    slug = "_".join(w.lower().strip(".,;:!?") for w in words[:4])
    return f"{memory.memory_type.value}:{slug}"


def _summarize_locally(memories: list[Memory]) -> str:
    """Very cheap local summarization — concatenate with truncation.

    Phase 5 will replace this with a real LLM call via get_provider().complete()
    once the provider ABC includes a non-streaming `complete(messages)` method.
    """
    lines = [f"- {m.content[:200]}" for m in memories[:20]]
    header = f"[Auto-consolidated from {len(memories)} conversation memories]"
    return header + "\n" + "\n".join(lines)
