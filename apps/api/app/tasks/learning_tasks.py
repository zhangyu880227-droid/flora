"""Celery tasks for the Automatic Learning pipeline."""
from __future__ import annotations

import asyncio
import uuid

from app.core.logging import get_logger
from app.db.session import async_session_maker
from app.tasks.celery_app import celery_app

log = get_logger(__name__)


@celery_app.task(name="flora.learning.run")
def run_learning_pipeline(workspace_id: str | None = None) -> dict:
    """Run the learning pipeline for one workspace or all workspaces.

    Args:
        workspace_id: UUID string; if None, runs for every workspace.
    """
    return asyncio.run(_run_async(workspace_id))


async def _run_async(workspace_id_str: str | None) -> dict:
    from sqlalchemy import select
    from app.models.workspace import Workspace
    from app.services.learning_service import LearningService

    async with async_session_maker() as db:
        if workspace_id_str:
            workspace_ids = [uuid.UUID(workspace_id_str)]
        else:
            result = await db.execute(select(Workspace.id))
            workspace_ids = list(result.scalars().all())

        results: dict[str, str] = {}
        for ws_id in workspace_ids:
            try:
                svc = LearningService(db)
                job = await svc.run_for_workspace(ws_id)
                await db.commit()
                results[str(ws_id)] = job.status
                log.info(
                    "learning.job_done",
                    extra={
                        "workspace_id": str(ws_id),
                        "status": job.status,
                        "docs": job.documents_scanned,
                        "memories": job.memories_created,
                        "kg": job.kg_nodes_updated,
                    },
                )
            except Exception as exc:
                await db.rollback()
                results[str(ws_id)] = f"error: {exc}"
                log.exception("learning.task_error", extra={"workspace_id": str(ws_id)})

        return results
