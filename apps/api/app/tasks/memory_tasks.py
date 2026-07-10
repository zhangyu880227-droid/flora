"""Celery tasks for periodic Memory Engine processing."""
from __future__ import annotations

import asyncio
import uuid

from app.tasks.celery_app import celery_app


@celery_app.task(name="app.tasks.memory_tasks.run_memory_engine", bind=True, max_retries=2)
def run_memory_engine(self, workspace_id: str | None = None) -> dict:
    """Run Memory Engine for one workspace (or all workspaces if None)."""
    return asyncio.run(_run_async(workspace_id))


async def _run_async(workspace_id: str | None) -> dict:
    from app.db.session import async_session_maker
    from app.services.memory_engine import MemoryEngine

    async with async_session_maker() as db:
        if workspace_id:
            engine = MemoryEngine(db)
            result = await engine.run_for_workspace(uuid.UUID(workspace_id))
            await db.commit()
            return {workspace_id: result}

        # All workspaces
        from sqlalchemy import select, distinct
        from app.models.memory import Memory

        result = await db.execute(select(distinct(Memory.workspace_id)))
        ws_ids = [row[0] for row in result.fetchall()]

        totals: dict = {}
        engine = MemoryEngine(db)
        for ws_id in ws_ids:
            try:
                totals[str(ws_id)] = await engine.run_for_workspace(ws_id)
            except Exception as exc:  # noqa: BLE001
                totals[str(ws_id)] = {"error": str(exc)}
        await db.commit()
        return totals
