"""Agent Framework service — creates, manages, and executes agent jobs.

Architecture:
  AgentJob (user intent) → AgentExecution (single run attempt)
  Each agent_type maps to an executor function in this service.
  Celery dispatches the actual work; this service owns lifecycle.

Phase 6 ships: research, summarize, extract_entities agent types.
Phase 7+ will add stock_analysis, report_generation, etc.
"""
from __future__ import annotations

import time
import uuid
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import NotFoundError
from app.core.logging import get_logger
from app.models.agent import AgentExecution, AgentExecutionStatus, AgentJob, AgentJobStatus

log = get_logger(__name__)

# Registry: agent_type → executor callable (async)
_EXECUTORS: dict[str, "AgentExecutor"] = {}

AgentExecutor = type  # placeholder; executors are registered at import time


def register_executor(agent_type: str):
    """Decorator to register an async executor for a given agent_type."""
    def decorator(fn):
        _EXECUTORS[agent_type] = fn
        return fn
    return decorator


class AgentService:
    def __init__(self, db: AsyncSession) -> None:
        self._db = db

    # ── Job lifecycle ──────────────────────────────────────────────────────

    async def create_job(
        self,
        workspace_id: uuid.UUID,
        user_id: uuid.UUID | None,
        agent_type: str,
        name: str,
        goal: str,
        input_data: dict,
    ) -> AgentJob:
        job = AgentJob(
            workspace_id=workspace_id,
            user_id=user_id,
            agent_type=agent_type,
            name=name,
            goal=goal,
            input_data=input_data or {},
            status=AgentJobStatus.pending,
        )
        self._db.add(job)
        await self._db.flush()
        log.info("agent.job_created", extra={"job_id": str(job.id), "type": agent_type})
        return job

    async def get_job(self, job_id: uuid.UUID, workspace_id: uuid.UUID) -> AgentJob:
        job = await self._db.get(AgentJob, job_id)
        if not job or job.workspace_id != workspace_id:
            raise NotFoundError(f"AgentJob {job_id} not found")
        return job

    async def list_jobs(
        self,
        workspace_id: uuid.UUID,
        *,
        agent_type: str | None = None,
        status: AgentJobStatus | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[AgentJob], int]:
        filters = [AgentJob.workspace_id == workspace_id]
        if agent_type:
            filters.append(AgentJob.agent_type == agent_type)
        if status:
            filters.append(AgentJob.status == status)

        count_result = await self._db.execute(
            select(AgentJob).where(*filters)
        )
        total = len(count_result.scalars().all())

        result = await self._db.execute(
            select(AgentJob)
            .where(*filters)
            .order_by(AgentJob.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all()), total

    async def cancel_job(self, job_id: uuid.UUID, workspace_id: uuid.UUID) -> AgentJob:
        job = await self.get_job(job_id, workspace_id)
        if job.status in (AgentJobStatus.completed, AgentJobStatus.failed):
            return job
        job.status = AgentJobStatus.cancelled
        await self._db.flush()
        return job

    # ── Execution lifecycle ────────────────────────────────────────────────

    async def create_execution(
        self, job: AgentJob, attempt: int = 1
    ) -> AgentExecution:
        execution = AgentExecution(
            job_id=job.id,
            workspace_id=job.workspace_id,
            status=AgentExecutionStatus.queued,
            attempt=attempt,
            steps=[],
        )
        self._db.add(execution)
        await self._db.flush()
        return execution

    async def run_execution(self, execution_id: uuid.UUID) -> None:
        """Execute an AgentExecution synchronously (called from Celery worker)."""
        execution = await self._db.get(AgentExecution, execution_id)
        if not execution:
            raise NotFoundError(f"AgentExecution {execution_id} not found")

        job = await self._db.get(AgentJob, execution.job_id)
        if not job:
            raise NotFoundError(f"AgentJob {execution.job_id} not found")

        execution.status = AgentExecutionStatus.running
        job.status = AgentJobStatus.running
        await self._db.flush()

        started_ms = time.monotonic()
        steps: list[dict] = []

        try:
            executor_fn = _EXECUTORS.get(job.agent_type)
            if not executor_fn:
                raise ValueError(f"No executor for agent_type={job.agent_type!r}")

            output = await executor_fn(job=job, steps=steps, db=self._db)

            execution.status = AgentExecutionStatus.completed
            execution.steps = steps
            execution.output = output or {}
            execution.duration_ms = int((time.monotonic() - started_ms) * 1000)

            job.status = AgentJobStatus.completed
            job.result = output or {}

        except Exception as exc:
            log.exception(
                "agent.execution_failed",
                extra={"execution_id": str(execution_id), "error": str(exc)},
            )
            execution.status = AgentExecutionStatus.failed
            execution.error_message = str(exc)
            execution.steps = steps
            execution.duration_ms = int((time.monotonic() - started_ms) * 1000)

            job.status = AgentJobStatus.failed
            job.error_message = str(exc)

        await self._db.flush()

    async def list_executions(
        self, job_id: uuid.UUID, workspace_id: uuid.UUID
    ) -> list[AgentExecution]:
        result = await self._db.execute(
            select(AgentExecution)
            .where(
                AgentExecution.job_id == job_id,
                AgentExecution.workspace_id == workspace_id,
            )
            .order_by(AgentExecution.attempt)
        )
        return list(result.scalars().all())


# ── Built-in Executors ──────────────────────────────────────────────────────

@register_executor("research")
async def _research_executor(job: AgentJob, steps: list, db: AsyncSession) -> dict:
    """Research agent: searches knowledge base and synthesizes an answer."""
    from app.services.search import hybrid_search

    query = job.goal
    workspace_id = job.workspace_id

    steps.append({"step": "search", "tool": "hybrid_search", "input": query,
                  "ts": datetime.now(timezone.utc).isoformat()})

    results = await hybrid_search(query=query, workspace_id=workspace_id, db=db)

    steps.append({
        "step": "search_done",
        "tool": "hybrid_search",
        "output": f"Found {len(results)} chunks",
        "ts": datetime.now(timezone.utc).isoformat(),
    })

    context = "\n\n".join(r.content[:500] for r in results[:5])
    steps.append({"step": "synthesize", "tool": "llm", "input": query[:200],
                  "ts": datetime.now(timezone.utc).isoformat()})

    # Phase 6: simple extraction — Phase 7 will stream LLM here
    answer = f"Research result for: {query}\n\nBased on {len(results)} chunks:\n{context[:1000]}"

    return {"query": query, "chunks_found": len(results), "answer": answer}


@register_executor("summarize")
async def _summarize_executor(job: AgentJob, steps: list, db: AsyncSession) -> dict:
    """Summarize executor: summarizes provided text or a source."""
    text = job.input_data.get("text", job.goal)
    steps.append({"step": "summarize", "tool": "local",
                  "ts": datetime.now(timezone.utc).isoformat()})
    summary = text[:1000] + ("…" if len(text) > 1000 else "")
    return {"summary": summary, "length": len(text)}


@register_executor("extract_entities")
async def _extract_entities_executor(
    job: AgentJob, steps: list, db: AsyncSession
) -> dict:
    """Entity extraction executor: pulls entities from text and updates KG."""
    from app.services.knowledge.kg_service import KGService

    text = job.input_data.get("text", job.goal)
    steps.append({"step": "extract", "tool": "regex_ner",
                  "ts": datetime.now(timezone.utc).isoformat()})

    # Naïve extraction: words starting with capital letters (placeholder for NLP)
    words = {w.strip(".,;:'\"") for w in text.split() if w and w[0].isupper() and len(w) > 2}
    entities = list(words)[:20]

    if entities:
        from app.models.memory import Memory
        svc = KGService(db)
        # Create a transient Memory to hold the entities list
        dummy_memory = Memory(
            workspace_id=job.workspace_id,
            user_id=job.user_id or uuid.UUID(int=0),
            memory_type="semantic",  # type: ignore[arg-type]
            content=text[:200],
            access_count=0,
        )
        db.add(dummy_memory)
        await db.flush()
        nodes = await svc.link_memory_entities(
            job.workspace_id, dummy_memory, entities, "concept"
        )
        steps.append({
            "step": "kg_update",
            "tool": "kg_service",
            "output": f"Linked {len(nodes)} entities",
            "ts": datetime.now(timezone.utc).isoformat(),
        })

    return {"entities": entities, "kg_nodes_created": len(entities)}
