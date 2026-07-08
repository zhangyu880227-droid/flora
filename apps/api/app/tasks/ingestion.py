import asyncio
import uuid

from app.db.session import AsyncSessionLocal
from app.services.ingestion import process_source
from app.tasks.celery_app import celery_app


@celery_app.task(bind=True, max_retries=3, default_retry_delay=30)
def ingest_source(self, source_id: str) -> dict:
    try:
        asyncio.run(_run(uuid.UUID(source_id)))
        return {"status": "ok", "source_id": source_id}
    except Exception as exc:
        raise self.retry(exc=exc)


async def _run(source_id: uuid.UUID) -> None:
    async with AsyncSessionLocal() as db:
        await process_source(source_id, db)
