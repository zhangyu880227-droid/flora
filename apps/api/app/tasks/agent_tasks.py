"""Celery tasks for the AI Agent Framework."""
from __future__ import annotations

import asyncio
import uuid

from app.tasks.celery_app import celery_app


@celery_app.task(
    name="app.tasks.agent_tasks.run_agent_execution",
    bind=True,
    max_retries=2,
    default_retry_delay=30,
)
def run_agent_execution(self, execution_id: str) -> dict:
    """Run a single AgentExecution (called by AgentService.dispatch_job)."""
    return asyncio.run(_run_async(execution_id, self.request.retries))


async def _run_async(execution_id: str, retry_count: int) -> dict:
    from app.db.session import async_session_maker
    from app.services.agent_service import AgentService

    async with async_session_maker() as db:
        svc = AgentService(db)
        await svc.run_execution(uuid.UUID(execution_id))
        await db.commit()
        return {"execution_id": execution_id, "status": "done"}
