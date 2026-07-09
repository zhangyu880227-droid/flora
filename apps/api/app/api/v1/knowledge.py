"""
Knowledge Pipeline API — workspace-scoped endpoints for managing feeds,
browsing collected documents, and triggering manual collection runs.
"""
from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.deps import CurrentUser, DB, require_workspace_member
from app.models.knowledge import KGEdge, KGNode, KnowledgeDocument, KnowledgeFeed, KnowledgeIngestionRun
from app.models.workspace import WorkspaceRole

router = APIRouter()


# ── Pydantic schemas ──────────────────────────────────────────────────────────

class FeedCreate(BaseModel):
    name: str
    type: str
    config: dict = {}


class FeedResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    type: str
    config: dict
    is_active: bool
    schedule_minutes: int
    last_collected_at: str | None
    next_collect_at: str | None
    consecutive_failures: int
    created_at: str

    class Config:
        from_attributes = True


class DocumentResponse(BaseModel):
    id: str
    workspace_id: str
    feed_id: str | None
    source_type: str
    title: str
    url: str | None
    author: str | None
    published_at: str | None
    collected_at: str
    summary: str | None
    key_insights: list
    entities: list
    relationships: list
    tags: list
    confidence_score: float
    status: str
    metadata: dict
    created_at: str

    class Config:
        from_attributes = True


class RunResponse(BaseModel):
    id: str
    workspace_id: str
    feed_id: str | None
    run_type: str
    started_at: str
    completed_at: str | None
    status: str
    documents_found: int
    documents_new: int
    documents_skipped: int
    documents_failed: int
    error_message: str | None
    created_at: str

    class Config:
        from_attributes = True


class StatsResponse(BaseModel):
    total_docs: int
    docs_today: int
    docs_this_week: int
    by_source_type: dict[str, int]
    by_tag: list[dict]
    active_feeds: int
    latest_run: RunResponse | None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _doc_to_response(doc: KnowledgeDocument) -> dict:
    return {
        "id": str(doc.id),
        "workspace_id": str(doc.workspace_id),
        "feed_id": str(doc.feed_id) if doc.feed_id else None,
        "source_type": doc.source_type,
        "title": doc.title,
        "url": doc.url,
        "author": doc.author,
        "published_at": doc.published_at,
        "collected_at": doc.collected_at,
        "summary": doc.summary,
        "key_insights": doc.key_insights or [],
        "entities": doc.entities or [],
        "relationships": doc.relationships or [],
        "tags": doc.tags or [],
        "confidence_score": doc.confidence_score,
        "importance_score": getattr(doc, "importance_score", 0.5),
        "status": doc.status,
        "metadata": doc.metadata_ or {},
        "created_at": doc.created_at.isoformat() if doc.created_at else "",
    }


def _feed_to_response(feed: KnowledgeFeed) -> dict:
    return {
        "id": str(feed.id),
        "workspace_id": str(feed.workspace_id),
        "name": feed.name,
        "type": feed.type,
        "config": feed.config or {},
        "is_active": feed.is_active,
        "schedule_minutes": feed.schedule_minutes,
        "last_collected_at": feed.last_collected_at,
        "next_collect_at": feed.next_collect_at,
        "consecutive_failures": feed.consecutive_failures,
        "created_at": feed.created_at.isoformat() if feed.created_at else "",
    }


def _run_to_response(run: KnowledgeIngestionRun) -> dict:
    return {
        "id": str(run.id),
        "workspace_id": str(run.workspace_id),
        "feed_id": str(run.feed_id) if run.feed_id else None,
        "run_type": run.run_type,
        "started_at": run.started_at,
        "completed_at": run.completed_at,
        "status": run.status,
        "documents_found": run.documents_found,
        "documents_new": run.documents_new,
        "documents_skipped": run.documents_skipped,
        "documents_failed": run.documents_failed,
        "error_message": run.error_message,
        "created_at": run.created_at.isoformat() if run.created_at else "",
    }


# ── Documents ─────────────────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/knowledge/documents")
async def list_documents(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    source_type: str | None = Query(None),
    since: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0),
) -> list[dict]:
    await require_workspace_member(workspace_id, current_user, db)

    q = (
        select(KnowledgeDocument)
        .where(
            KnowledgeDocument.workspace_id == workspace_id,
            KnowledgeDocument.status == "ready",
        )
        .order_by(KnowledgeDocument.importance_score.desc(), KnowledgeDocument.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if source_type:
        q = q.where(KnowledgeDocument.source_type == source_type)
    if since:
        q = q.where(KnowledgeDocument.collected_at >= since)

    result = await db.execute(q)
    docs = result.scalars().all()
    return [_doc_to_response(d) for d in docs]


@router.get("/workspaces/{workspace_id}/knowledge/documents/{doc_id}")
async def get_document(
    workspace_id: uuid.UUID,
    doc_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
) -> dict:
    await require_workspace_member(workspace_id, current_user, db)
    doc = await db.get(KnowledgeDocument, doc_id)
    if not doc or doc.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Document not found")
    return _doc_to_response(doc)


# ── Feeds ─────────────────────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/knowledge/feeds")
async def list_feeds(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
) -> list[dict]:
    await require_workspace_member(workspace_id, current_user, db)
    # Seed defaults if needed (also done by pipeline, but handy for UI)
    from app.services.knowledge.pipeline import seed_default_feeds
    await seed_default_feeds(workspace_id, db)

    result = await db.execute(
        select(KnowledgeFeed)
        .where(KnowledgeFeed.workspace_id == workspace_id)
        .order_by(KnowledgeFeed.created_at)
    )
    return [_feed_to_response(f) for f in result.scalars().all()]


@router.post("/workspaces/{workspace_id}/knowledge/feeds", status_code=status.HTTP_201_CREATED)
async def create_feed(
    workspace_id: uuid.UUID,
    body: FeedCreate,
    current_user: CurrentUser,
    db: DB,
) -> dict:
    await require_workspace_member(workspace_id, current_user, db, minimum_role=WorkspaceRole.editor)
    feed = KnowledgeFeed(
        workspace_id=workspace_id,
        name=body.name,
        type=body.type,
        config=body.config,
    )
    db.add(feed)
    await db.commit()
    await db.refresh(feed)
    return _feed_to_response(feed)


@router.delete("/workspaces/{workspace_id}/knowledge/feeds/{feed_id}", status_code=204)
async def delete_feed(
    workspace_id: uuid.UUID,
    feed_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
) -> None:
    await require_workspace_member(workspace_id, current_user, db, minimum_role=WorkspaceRole.editor)
    feed = await db.get(KnowledgeFeed, feed_id)
    if not feed or feed.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Feed not found")
    await db.delete(feed)
    await db.commit()


@router.post("/workspaces/{workspace_id}/knowledge/feeds/{feed_id}/collect")
async def collect_feed(
    workspace_id: uuid.UUID,
    feed_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
) -> dict:
    await require_workspace_member(workspace_id, current_user, db, minimum_role=WorkspaceRole.editor)
    feed = await db.get(KnowledgeFeed, feed_id)
    if not feed or feed.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Feed not found")

    from app.tasks.knowledge_tasks import run_knowledge_pipeline
    task = run_knowledge_pipeline.delay(str(workspace_id))
    return {"task_id": task.id, "status": "queued"}


@router.post("/workspaces/{workspace_id}/knowledge/collect")
async def collect_all(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
) -> dict:
    await require_workspace_member(workspace_id, current_user, db, minimum_role=WorkspaceRole.editor)

    from app.tasks.knowledge_tasks import run_knowledge_pipeline
    task = run_knowledge_pipeline.delay(str(workspace_id))
    return {"task_id": task.id, "status": "queued"}


@router.post("/workspaces/{workspace_id}/knowledge/reprocess")
async def reprocess_all(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
) -> dict:
    """Re-run AI extraction on all stored documents (use after changing LLM provider)."""
    await require_workspace_member(workspace_id, current_user, db, minimum_role=WorkspaceRole.editor)

    from app.tasks.knowledge_tasks import reprocess_documents
    task = reprocess_documents.delay(str(workspace_id))
    return {"task_id": task.id, "status": "queued"}


@router.post("/workspaces/{workspace_id}/knowledge/loop")
async def trigger_loop(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
) -> dict:
    """Manually trigger the full Self-Improvement Loop cycle."""
    await require_workspace_member(workspace_id, current_user, db, minimum_role=WorkspaceRole.editor)

    from app.tasks.knowledge_tasks import run_self_improvement_loop
    task = run_self_improvement_loop.delay(str(workspace_id))
    return {"task_id": task.id, "status": "queued"}


# ── Knowledge Graph ────────────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/knowledge/graph/nodes")
async def list_graph_nodes(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    entity_type: str | None = Query(None),
    min_doc_count: int = Query(1, ge=1),
    limit: int = Query(100, le=500),
) -> list[dict]:
    await require_workspace_member(workspace_id, current_user, db)
    q = (
        select(KGNode)
        .where(
            KGNode.workspace_id == workspace_id,
            KGNode.doc_count >= min_doc_count,
        )
        .order_by(KGNode.doc_count.desc())
        .limit(limit)
    )
    if entity_type:
        q = q.where(KGNode.entity_type == entity_type)
    result = await db.execute(q)
    return [_node_to_dict(n) for n in result.scalars().all()]


@router.get("/workspaces/{workspace_id}/knowledge/graph/edges")
async def list_graph_edges(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    node_id: str | None = Query(None, description="Filter edges by source or target node ID"),
    limit: int = Query(200, le=1000),
) -> list[dict]:
    await require_workspace_member(workspace_id, current_user, db)
    q = (
        select(KGEdge)
        .where(KGEdge.workspace_id == workspace_id)
        .order_by(KGEdge.weight.desc())
        .limit(limit)
    )
    if node_id:
        nid = uuid.UUID(node_id)
        q = q.where((KGEdge.source_id == nid) | (KGEdge.target_id == nid))
    result = await db.execute(q)
    return [_edge_to_dict(e) for e in result.scalars().all()]


@router.get("/workspaces/{workspace_id}/knowledge/graph/stats")
async def graph_stats(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
) -> dict:
    await require_workspace_member(workspace_id, current_user, db)

    node_count = await db.scalar(
        select(func.count(KGNode.id)).where(KGNode.workspace_id == workspace_id)
    ) or 0
    edge_count = await db.scalar(
        select(func.count(KGEdge.id)).where(KGEdge.workspace_id == workspace_id)
    ) or 0
    top_nodes_result = await db.execute(
        select(KGNode)
        .where(KGNode.workspace_id == workspace_id)
        .order_by(KGNode.doc_count.desc())
        .limit(10)
    )
    by_type_result = await db.execute(
        select(KGNode.entity_type, func.count(KGNode.id))
        .where(KGNode.workspace_id == workspace_id)
        .group_by(KGNode.entity_type)
    )
    return {
        "node_count": node_count,
        "edge_count": edge_count,
        "top_nodes": [_node_to_dict(n) for n in top_nodes_result.scalars().all()],
        "by_entity_type": {row[0]: row[1] for row in by_type_result.all()},
    }


# ── Runs ──────────────────────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/knowledge/runs")
async def list_runs(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    limit: int = Query(20, le=100),
) -> list[dict]:
    await require_workspace_member(workspace_id, current_user, db)
    result = await db.execute(
        select(KnowledgeIngestionRun)
        .where(KnowledgeIngestionRun.workspace_id == workspace_id)
        .order_by(KnowledgeIngestionRun.created_at.desc())
        .limit(limit)
    )
    return [_run_to_response(r) for r in result.scalars().all()]


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/knowledge/stats")
async def get_stats(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
) -> dict:
    await require_workspace_member(workspace_id, current_user, db)

    now = datetime.now(tz=timezone.utc)
    today_iso = (now - timedelta(hours=24)).isoformat()
    week_iso = (now - timedelta(days=7)).isoformat()

    # Total docs
    total_r = await db.execute(
        select(func.count(KnowledgeDocument.id)).where(
            KnowledgeDocument.workspace_id == workspace_id,
            KnowledgeDocument.status == "ready",
        )
    )
    total_docs = total_r.scalar() or 0

    # Docs today
    today_r = await db.execute(
        select(func.count(KnowledgeDocument.id)).where(
            KnowledgeDocument.workspace_id == workspace_id,
            KnowledgeDocument.status == "ready",
            KnowledgeDocument.collected_at >= today_iso,
        )
    )
    docs_today = today_r.scalar() or 0

    # Docs this week
    week_r = await db.execute(
        select(func.count(KnowledgeDocument.id)).where(
            KnowledgeDocument.workspace_id == workspace_id,
            KnowledgeDocument.status == "ready",
            KnowledgeDocument.collected_at >= week_iso,
        )
    )
    docs_this_week = week_r.scalar() or 0

    # By source type
    type_r = await db.execute(
        select(KnowledgeDocument.source_type, func.count(KnowledgeDocument.id))
        .where(
            KnowledgeDocument.workspace_id == workspace_id,
            KnowledgeDocument.status == "ready",
        )
        .group_by(KnowledgeDocument.source_type)
    )
    by_source_type = {row[0]: row[1] for row in type_r.all()}

    # Active feeds
    feeds_r = await db.execute(
        select(func.count(KnowledgeFeed.id)).where(
            KnowledgeFeed.workspace_id == workspace_id,
            KnowledgeFeed.is_active == True,  # noqa: E712
        )
    )
    active_feeds = feeds_r.scalar() or 0

    # Latest run
    run_r = await db.execute(
        select(KnowledgeIngestionRun)
        .where(KnowledgeIngestionRun.workspace_id == workspace_id)
        .order_by(KnowledgeIngestionRun.created_at.desc())
        .limit(1)
    )
    latest_run_obj = run_r.scalar_one_or_none()
    latest_run = _run_to_response(latest_run_obj) if latest_run_obj else None

    # Top tags (from JSONB array — count using unnest)
    try:
        tag_r = await db.execute(
            select(
                func.jsonb_array_elements_text(KnowledgeDocument.tags).label("tag"),
                func.count("*").label("cnt"),
            )
            .where(
                KnowledgeDocument.workspace_id == workspace_id,
                KnowledgeDocument.status == "ready",
            )
            .group_by("tag")
            .order_by(func.count("*").desc())
            .limit(20)
        )
        by_tag = [{"tag": row[0], "count": row[1]} for row in tag_r.all()]
    except Exception:
        by_tag = []

    return {
        "total_docs": total_docs,
        "docs_today": docs_today,
        "docs_this_week": docs_this_week,
        "by_source_type": by_source_type,
        "by_tag": by_tag,
        "active_feeds": active_feeds,
        "latest_run": latest_run,
    }


# ── KG serializers ─────────────────────────────────────────────────────────────

def _node_to_dict(node: KGNode) -> dict:
    return {
        "id": str(node.id),
        "workspace_id": str(node.workspace_id),
        "label": node.label,
        "entity_type": node.entity_type,
        "doc_count": node.doc_count,
        "total_relevance": node.total_relevance,
        "avg_relevance": round(node.total_relevance / node.doc_count, 3) if node.doc_count else 0.0,
        "first_seen": node.first_seen,
        "last_seen": node.last_seen,
        "created_at": node.created_at.isoformat() if node.created_at else "",
    }


def _edge_to_dict(edge: KGEdge) -> dict:
    return {
        "id": str(edge.id),
        "workspace_id": str(edge.workspace_id),
        "source_id": str(edge.source_id),
        "target_id": str(edge.target_id),
        "relation": edge.relation,
        "weight": edge.weight,
        "confidence": getattr(edge, "confidence", 0.5),
        "first_seen": edge.first_seen,
        "last_seen": edge.last_seen,
        "created_at": edge.created_at.isoformat() if edge.created_at else "",
    }


# ── Knowledge Gaps ─────────────────────────────────────────────────────────────

def _flora_dir() -> Path:
    """Walk up from this file to find .flora/ at the monorepo root."""
    current = Path(__file__).resolve().parent
    for _ in range(12):
        if (current / "turbo.json").exists() or (current / "pnpm-workspace.yaml").exists():
            return current / ".flora"
        current = current.parent
    return Path(__file__).resolve().parents[6] / ".flora"


@router.get("/workspaces/{workspace_id}/knowledge/gaps")
async def list_gaps(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    limit: int = Query(20, le=100),
) -> list[dict]:
    """Return knowledge-gap research tasks from the self-improvement loop."""
    await require_workspace_member(workspace_id, current_user, db)

    tasks_path = _flora_dir() / "tasks.json"
    if not tasks_path.exists():
        return []

    try:
        raw = json.loads(tasks_path.read_text())
        tasks = raw.get("tasks", []) if isinstance(raw, dict) else raw
    except (json.JSONDecodeError, OSError):
        return []

    gap_tasks = [
        {
            "entity": t.get("entity", ""),
            "gapType": t.get("gap_type", ""),
            "description": t.get("description", ""),
            "suggestedQuery": t.get("suggested_query", ""),
            "priority": t.get("priority", 3),
        }
        for t in tasks
        if t.get("source") == "knowledge-gap"
    ]
    gap_tasks.sort(key=lambda g: g["priority"])
    return gap_tasks[:limit]
