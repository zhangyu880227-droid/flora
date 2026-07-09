import asyncio
import uuid

from app.db.session import AsyncSessionLocal
from app.tasks.celery_app import celery_app


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name="app.tasks.knowledge_tasks.reprocess_documents",
)
def reprocess_documents(self, workspace_id: str | None = None) -> dict:
    try:
        result = asyncio.run(_reprocess(workspace_id))
        return result
    except Exception as exc:
        raise self.retry(exc=exc)


async def _reprocess(workspace_id: str | None) -> dict:
    from sqlalchemy import select

    from app.models.knowledge import KnowledgeDocument
    from app.models.workspace import Workspace
    from app.services.embedding import embed_texts
    from app.services.knowledge.extractor import extract_knowledge

    async with AsyncSessionLocal() as db:
        if workspace_id:
            workspace_ids = [uuid.UUID(workspace_id)]
        else:
            result = await db.execute(select(Workspace.id))
            workspace_ids = list(result.scalars().all())

        total_processed = 0
        total_failed = 0

        for ws_id in workspace_ids:
            docs_result = await db.execute(
                select(KnowledgeDocument).where(KnowledgeDocument.workspace_id == ws_id)
            )
            docs = list(docs_result.scalars().all())

            for doc in docs:
                try:
                    content = doc.clean_content or doc.raw_content or ""
                    extraction = await extract_knowledge(doc.title, content)

                    doc.summary = extraction.summary
                    doc.key_insights = extraction.key_insights
                    doc.entities = extraction.entities
                    doc.relationships = extraction.relationships
                    doc.tags = extraction.tags
                    doc.confidence_score = extraction.confidence_score

                    try:
                        embed_input = f"{doc.title}\n\n{extraction.summary or content[:500]}"
                        embeddings = await embed_texts([embed_input])
                        if embeddings:
                            doc.embedding = embeddings[0]
                    except Exception:
                        pass

                    total_processed += 1
                except Exception:
                    total_failed += 1

            await db.commit()

        return {
            "workspaces_processed": len(workspace_ids),
            "documents_processed": total_processed,
            "documents_failed": total_failed,
        }


@celery_app.task(
    bind=True,
    max_retries=3,
    default_retry_delay=60,
    name="app.tasks.knowledge_tasks.run_knowledge_pipeline",
)
def run_knowledge_pipeline(self, workspace_id: str | None = None) -> dict:
    try:
        result = asyncio.run(_run_pipeline(workspace_id))
        return result
    except Exception as exc:
        raise self.retry(exc=exc)


async def _run_pipeline(workspace_id: str | None) -> dict:
    from sqlalchemy import select

    from app.models.workspace import Workspace
    from app.services.knowledge.pipeline import run_workspace

    async with AsyncSessionLocal() as db:
        if workspace_id:
            workspace_ids = [uuid.UUID(workspace_id)]
        else:
            result = await db.execute(select(Workspace.id))
            workspace_ids = list(result.scalars().all())

        total_new = 0
        total_skipped = 0
        total_feeds = 0

        for ws_id in workspace_ids:
            runs = await run_workspace(ws_id, db)
            for r in runs:
                total_new += r.documents_new
                total_skipped += r.documents_skipped
                total_feeds += 1

        return {
            "workspaces_processed": len(workspace_ids),
            "feeds_processed": total_feeds,
            "documents_new": total_new,
            "documents_skipped": total_skipped,
        }


@celery_app.task(
    bind=True,
    max_retries=2,
    default_retry_delay=120,
    soft_time_limit=1500,   # 25 min soft limit
    time_limit=1620,        # 27 min hard limit
    name="app.tasks.knowledge_tasks.run_self_improvement_loop",
)
def run_self_improvement_loop(self, workspace_id: str | None = None) -> dict:
    """
    Full self-improvement cycle:
      1. Recover stale runs
      2. Collect from all feeds
      3. Build Knowledge Graph
      4. Detect gaps → research tasks
      5. Update ATLAS.md with knowledge stats
    """
    try:
        result = asyncio.run(_run_loop(workspace_id))
        return result
    except Exception as exc:
        raise self.retry(exc=exc)


async def _run_loop(workspace_id: str | None) -> dict:
    from sqlalchemy import select

    from app.models.workspace import Workspace
    from app.services.knowledge.loop import SelfImprovementLoop

    loop = SelfImprovementLoop()

    async with AsyncSessionLocal() as db:
        if workspace_id:
            workspace_ids = [uuid.UUID(workspace_id)]
        else:
            result = await db.execute(select(Workspace.id))
            workspace_ids = list(result.scalars().all())

        all_results = []
        for ws_id in workspace_ids:
            loop_result = await loop.run(ws_id, db)
            all_results.append({
                "workspace_id": loop_result.workspace_id,
                "feeds_processed": loop_result.feeds_processed,
                "documents_new": loop_result.documents_new,
                "graph_nodes": loop_result.graph.node_count,
                "graph_edges": loop_result.graph.edge_count,
                "gaps_detected": loop_result.gaps_detected,
                "stale_runs_recovered": loop_result.stale_runs_recovered,
                "errors": loop_result.errors,
            })

    return {
        "workspaces_processed": len(all_results),
        "results": all_results,
    }
