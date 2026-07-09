"""
Knowledge Pipeline API — workspace-scoped endpoints for managing feeds,
browsing collected documents, and triggering manual collection runs.
"""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select, text

from app.core.deps import CurrentUser, DB, require_workspace_member
from app.models.knowledge import KGEdge, KGNode, KnowledgeDocument, KnowledgeFeed, KnowledgeIngestionRun
from app.models.workspace import WorkspaceRole

router = APIRouter()


class AskRequest(BaseModel):
    question: str
    limit: int = 5


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


# ── Ask Flora (semantic Q&A over knowledge base) ───────────────────────────────

@router.post("/workspaces/{workspace_id}/knowledge/ask")
async def ask_knowledge(
    workspace_id: uuid.UUID,
    body: AskRequest,
    current_user: CurrentUser,
    db: DB,
) -> dict:
    """Semantic search + AI synthesis over the knowledge base."""
    await require_workspace_member(workspace_id, current_user, db)

    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question cannot be empty")

    # 1. Embed the question
    try:
        from app.services.embedding import embed_query
        q_vec = await embed_query(body.question)
        vec_str = str(q_vec)
    except Exception:
        q_vec = None
        vec_str = None

    # 2. Semantic search on knowledge_documents
    docs: list[KnowledgeDocument] = []
    if vec_str:
        rows = await db.execute(
            text("""
                SELECT id FROM knowledge_documents
                WHERE workspace_id = :wsid
                  AND status = 'ready'
                  AND embedding IS NOT NULL
                ORDER BY embedding <=> CAST(:vec AS vector)
                LIMIT :lim
            """),
            {"wsid": str(workspace_id), "vec": vec_str, "lim": body.limit},
        )
        doc_ids = [r[0] for r in rows.all()]
        for did in doc_ids:
            doc = await db.get(KnowledgeDocument, did)
            if doc:
                docs.append(doc)

    # 3. Fallback: keyword search on title + summary
    if not docs:
        kw = body.question[:100]
        fallback = await db.execute(
            select(KnowledgeDocument)
            .where(
                KnowledgeDocument.workspace_id == workspace_id,
                KnowledgeDocument.status == "ready",
            )
            .order_by(KnowledgeDocument.importance_score.desc())
            .limit(body.limit)
        )
        docs = list(fallback.scalars().all())

    if not docs:
        return {"answer": "No relevant documents found in the knowledge base yet.", "sources": []}

    # 4. Build context block
    context_parts = []
    for i, doc in enumerate(docs, 1):
        ents = ", ".join(e.get("name", "") for e in (doc.entities or [])[:5])
        rels = "; ".join(
            f"{r.get('from','')} {r.get('relation','')} {r.get('to','')}"
            for r in (doc.relationships or [])[:3]
        )
        part = (
            f"[{i}] {doc.title}\n"
            f"Summary: {doc.summary or ''}\n"
            f"Entities: {ents}\n"
            f"Relationships: {rels}\n"
        )
        context_parts.append(part)

    context = "\n\n".join(context_parts)

    # 5. AI synthesis
    SYSTEM = (
        "You are Flora, an AI research analyst. Answer the user's question using only "
        "the provided knowledge base excerpts. Be concise (3-5 sentences). Cite sources "
        "using [1], [2] etc. If the answer is not in the sources, say so."
    )
    prompt = f"Question: {body.question}\n\nKnowledge Base:\n{context}"

    try:
        from app.services.ai import get_provider
        provider = get_provider()
        answer = await asyncio.wait_for(
            provider.complete(system=SYSTEM, prompt=prompt),
            timeout=45.0,
        )
    except asyncio.TimeoutError:
        # Ollama is busy — return a raw summary instead of AI synthesis
        bullets = "\n".join(f"• [{i}] {d.title}: {(d.summary or '')[:120]}…" for i, d in enumerate(docs, 1))
        answer = f"(AI synthesis timed out — raw results below)\n\n{bullets}"
    except Exception as exc:
        answer = f"AI synthesis unavailable: {exc}"

    sources = [
        {
            "id": str(doc.id),
            "title": doc.title,
            "url": doc.url,
            "source_type": doc.source_type,
            "published_at": doc.published_at,
            "confidence_score": doc.confidence_score,
        }
        for doc in docs
    ]

    return {"answer": answer, "sources": sources}


# ── Trending entities ─────────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/knowledge/trending")
async def trending_entities(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
    hours: int = Query(24, ge=1, le=168),
    limit: int = Query(10, le=30),
) -> list[dict]:
    """Entities with highest mention frequency in recent documents."""
    await require_workspace_member(workspace_id, current_user, db)

    since = (datetime.now(tz=timezone.utc) - timedelta(hours=hours)).isoformat()

    recent_docs_result = await db.execute(
        select(KnowledgeDocument)
        .where(
            KnowledgeDocument.workspace_id == workspace_id,
            KnowledgeDocument.status == "ready",
            KnowledgeDocument.collected_at >= since,
        )
    )
    recent_docs = list(recent_docs_result.scalars().all())

    # Count entity mentions across recent docs
    counts: dict[tuple[str, str], int] = {}
    for doc in recent_docs:
        for ent in (doc.entities or []):
            name = str(ent.get("name", "")).strip().lower()
            etype = str(ent.get("type", "concept"))
            if name:
                counts[(name, etype)] = counts.get((name, etype), 0) + 1

    sorted_ents = sorted(counts.items(), key=lambda x: x[1], reverse=True)[:limit]

    # Look up overall doc_count from KGNode for trend comparison
    result = []
    for (name, etype), recent_count in sorted_ents:
        node_row = await db.execute(
            select(KGNode).where(
                KGNode.workspace_id == workspace_id,
                KGNode.label == name,
                KGNode.entity_type == etype,
            ).limit(1)
        )
        node = node_row.scalar_one_or_none()
        total_count = node.doc_count if node else recent_count
        trend_pct = round((recent_count / max(total_count, 1)) * 100)
        result.append({
            "name": name,
            "entity_type": etype,
            "recent_count": recent_count,
            "total_count": total_count,
            "trend_pct": trend_pct,
            "node_id": str(node.id) if node else None,
        })

    return result


# ── Intelligence Briefing ─────────────────────────────────────────────────────

@router.get("/workspaces/{workspace_id}/knowledge/briefing")
async def intelligence_briefing(
    workspace_id: uuid.UUID,
    current_user: CurrentUser,
    db: DB,
) -> dict:
    """AI-generated daily intelligence briefing from the knowledge base."""
    await require_workspace_member(workspace_id, current_user, db)

    now = datetime.now(tz=timezone.utc)
    since_24h = (now - timedelta(hours=24)).isoformat()

    # Recent docs
    recent_r = await db.execute(
        select(KnowledgeDocument)
        .where(
            KnowledgeDocument.workspace_id == workspace_id,
            KnowledgeDocument.status == "ready",
            KnowledgeDocument.collected_at >= since_24h,
        )
        .order_by(KnowledgeDocument.importance_score.desc())
        .limit(15)
    )
    recent_docs = list(recent_r.scalars().all())

    # Top entities
    top_nodes_r = await db.execute(
        select(KGNode)
        .where(KGNode.workspace_id == workspace_id)
        .order_by(KGNode.doc_count.desc())
        .limit(10)
    )
    top_nodes = list(top_nodes_r.scalars().all())

    # Top edges (relationships)
    top_edges_r = await db.execute(
        select(KGEdge, KGNode)
        .join(KGNode, KGEdge.source_id == KGNode.id)
        .where(KGEdge.workspace_id == workspace_id)
        .order_by(KGEdge.weight.desc())
        .limit(8)
    )
    top_edges = list(top_edges_r.all())

    total_docs = await db.scalar(
        select(func.count(KnowledgeDocument.id)).where(
            KnowledgeDocument.workspace_id == workspace_id,
            KnowledgeDocument.status == "ready",
        )
    ) or 0
    node_count = await db.scalar(
        select(func.count(KGNode.id)).where(KGNode.workspace_id == workspace_id)
    ) or 0

    if not recent_docs and not top_nodes:
        return {
            "briefing": "No intelligence data available yet. Run the knowledge pipeline to collect documents.",
            "generated_at": now.isoformat(),
            "doc_count": total_docs,
            "node_count": node_count,
            "recent_doc_count": 0,
        }

    # Build relationship lines without extra async calls
    edge_lines = []
    node_id_map: dict[str, KGNode] = {str(n.id): n for n in top_nodes}
    for edge, src_node in top_edges[:6]:
        tgt = node_id_map.get(str(edge.target_id))
        if tgt:
            rel = edge.relation.replace("_", " ")
            edge_lines.append(f"**{src_node.label}** {rel} **{tgt.label}** (×{edge.weight})")

    # Build structured briefing directly from data (fast, no LLM timeout risk)
    bullets: list[str] = []

    # Recent activity
    if recent_docs:
        high_imp = [d for d in recent_docs if d.importance_score >= 0.7]
        if high_imp:
            bullets.append(
                f"**{len(high_imp)} high-importance** event{'s' if len(high_imp) != 1 else ''} in the last 24 hours — "
                + "; ".join(f"**{d.title[:50]}**" for d in high_imp[:3])
            )
        else:
            bullets.append(
                f"**{len(recent_docs)} documents** collected in the last 24 hours across "
                + ", ".join(set(d.source_type for d in recent_docs[:5]))
            )

    # Top entities
    if top_nodes:
        orgs  = [n for n in top_nodes if n.entity_type == "org"][:4]
        techs = [n for n in top_nodes if n.entity_type == "tech"][:3]
        if orgs:
            bullets.append(
                "**Top organisations by coverage:** " + ", ".join(f"**{n.label}** ({n.doc_count})" for n in orgs)
            )
        if techs:
            bullets.append(
                "**Trending technologies:** " + ", ".join(f"**{n.label}** ({n.doc_count})" for n in techs)
            )

    # Key relationships
    if edge_lines:
        bullets.append("**Key relationships:** " + " · ".join(edge_lines[:3]))

    # Knowledge graph health
    edge_count = await db.scalar(select(func.count(KGEdge.id)).where(KGEdge.workspace_id == workspace_id)) or 0
    bullets.append(
        f"**Knowledge graph:** {total_docs} documents processed → {node_count} entities, {edge_count} relationships"
    )

    briefing_text = "\n".join(f"- {b}" for b in bullets)

    return {
        "briefing": briefing_text,
        "generated_at": now.isoformat(),
        "doc_count": total_docs,
        "node_count": node_count,
        "recent_doc_count": len(recent_docs),
    }
