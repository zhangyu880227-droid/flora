"""Celery task that runs the Self-Improvement Engine on a schedule."""
from __future__ import annotations

import logging

from app.tasks.celery_app import celery_app

logger = logging.getLogger(__name__)


@celery_app.task(
    name="app.tasks.engine_task.run_engine",
    bind=True,
    max_retries=1,
    default_retry_delay=300,
    soft_time_limit=300,   # 5 min soft limit
    time_limit=360,        # 6 min hard limit
)
def run_engine(self) -> dict:
    """Run a full Self-Improvement Engine scan and update all outputs."""
    try:
        from app.engine.core import SelfImprovementEngine
        engine = SelfImprovementEngine()
        result = engine.run()
        return {
            "scan_id": result.scan_id,
            "files_scanned": result.files_scanned,
            "findings": len(result.findings),
            "duration_seconds": round(result.duration_seconds, 2),
        }
    except Exception as exc:
        logger.exception("[engine] periodic scan failed: %s", exc)
        raise self.retry(exc=exc)
