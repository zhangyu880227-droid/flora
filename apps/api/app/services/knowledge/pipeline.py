"""
Autonomous Knowledge Pipeline orchestrator.

For each active KnowledgeFeed in a workspace:
  1. Collect items via the appropriate collector
  2. Clean content
  3. Deduplicate via sha256(clean_content)
  4. AI-extract knowledge (summary, insights, entities, tags, confidence)
  5. Embed via Voyage AI
  6. Persist KnowledgeDocument to PostgreSQL
  7. Record KnowledgeIngestionRun
"""
from __future__ import annotations

import hashlib
import re
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge import KnowledgeDocument, KnowledgeFeed, KnowledgeIngestionRun
from app.models.workspace import Workspace
from app.services.knowledge import collectors
from app.services.knowledge.collectors.base import CollectedItem
from app.services.knowledge.extractor import extract_knowledge
from app.services.embedding import embed_texts

DEFAULT_FEEDS = [
    # ── Tech & AI Research ────────────────────────────────────────────────────
    {
        "name": "Hacker News",
        "type": "rss",
        "config": {"url": "https://news.ycombinator.com/rss", "max_items": 20},
    },
    {
        "name": "ArXiv — AI",
        "type": "arxiv",
        "config": {"query": "cat:cs.AI", "max_results": 8, "sort_by": "submittedDate"},
    },
    {
        "name": "ArXiv — Machine Learning",
        "type": "arxiv",
        "config": {"query": "cat:cs.LG", "max_results": 8, "sort_by": "submittedDate"},
    },
    {
        "name": "GitHub Trending",
        "type": "github_trending",
        "config": {"since": "daily", "max_items": 15},
    },
    {
        "name": "MIT Technology Review",
        "type": "rss",
        "config": {"url": "https://www.technologyreview.com/feed/", "max_items": 15},
    },
    {
        "name": "The Gradient (AI Research)",
        "type": "rss",
        "config": {"url": "https://thegradient.pub/rss/", "max_items": 10},
    },
    # ── Financial & Market Intelligence ──────────────────────────────────────
    {
        "name": "Google News — AI & Technology",
        "type": "google_news",
        "config": {"query": "artificial intelligence technology", "max_items": 15},
    },
    {
        "name": "Google News — Semiconductors",
        "type": "google_news",
        "config": {"query": "semiconductor chip industry TSMC NVIDIA AMD", "max_items": 10},
    },
    {
        "name": "Google News — Investment & M&A",
        "type": "google_news",
        "config": {"query": "acquisition merger investment funding venture capital", "max_items": 10},
    },
    {
        "name": "Google News — Supply Chain",
        "type": "google_news",
        "config": {"query": "supply chain manufacturing factory production", "max_items": 10},
    },
    {
        "name": "TechCrunch",
        "type": "rss",
        "config": {"url": "https://techcrunch.com/feed/", "max_items": 15},
    },
    {
        "name": "The Verge",
        "type": "rss",
        "config": {"url": "https://www.theverge.com/rss/index.xml", "max_items": 10},
    },
    {
        "name": "Ars Technica",
        "type": "rss",
        "config": {"url": "https://feeds.arstechnica.com/arstechnica/technology-lab", "max_items": 10},
    },
    # ── SEC Filings (major corporate events) ──────────────────────────────────
    {
        "name": "SEC EDGAR — 8-K Filings",
        "type": "sec_edgar",
        "config": {"forms": "8-K", "max_items": 20},
    },
    {
        "name": "SEC EDGAR — Tech 8-K",
        "type": "sec_edgar",
        "config": {
            "forms": "8-K",
            "max_items": 15,
            "keywords": "technology,software,semiconductor,artificial intelligence,acquisition",
        },
    },
]


@dataclass
class RunResult:
    feed_id: uuid.UUID
    feed_name: str
    documents_found: int = 0
    documents_new: int = 0
    documents_skipped: int = 0
    documents_failed: int = 0
    error: str | None = None


async def seed_default_feeds(workspace_id: uuid.UUID, db: AsyncSession) -> None:
    existing_result = await db.execute(
        select(KnowledgeFeed.name).where(KnowledgeFeed.workspace_id == workspace_id)
    )
    existing_names = {row[0] for row in existing_result.all()}

    added = 0
    for fd in DEFAULT_FEEDS:
        if fd["name"] in existing_names:
            continue
        db.add(KnowledgeFeed(
            workspace_id=workspace_id,
            name=fd["name"],
            type=fd["type"],
            config=fd["config"],
            is_active=True,
            schedule_minutes=30,
        ))
        added += 1

    if added:
        await db.commit()


async def run_workspace(workspace_id: uuid.UUID, db: AsyncSession, run_type: str = "scheduled") -> list[RunResult]:
    # Seed default feeds if none exist
    await seed_default_feeds(workspace_id, db)

    feeds_result = await db.execute(
        select(KnowledgeFeed).where(
            KnowledgeFeed.workspace_id == workspace_id,
            KnowledgeFeed.is_active == True,  # noqa: E712
        )
    )
    feeds = list(feeds_result.scalars().all())

    results: list[RunResult] = []
    for feed in feeds:
        result = await run_feed(feed, db, run_type=run_type)
        results.append(result)

    return results


async def run_feed(
    feed: KnowledgeFeed,
    db: AsyncSession,
    run_type: str = "scheduled",
) -> RunResult:
    result = RunResult(feed_id=feed.id, feed_name=feed.name)
    now = datetime.now(tz=timezone.utc).isoformat()

    run = KnowledgeIngestionRun(
        workspace_id=feed.workspace_id,
        feed_id=feed.id,
        run_type=run_type,
        started_at=now,
        status="running",
    )
    db.add(run)
    await db.flush()

    try:
        items = await _collect(feed)
        result.documents_found = len(items)

        for item in items:
            try:
                stored = await _process_item(item, feed, db)
                if stored:
                    result.documents_new += 1
                else:
                    result.documents_skipped += 1
            except Exception as exc:
                result.documents_failed += 1

        # Update feed stats
        feed.last_collected_at = now
        feed.consecutive_failures = 0
        run.status = "completed"

    except Exception as exc:
        result.error = str(exc)
        feed.consecutive_failures = (feed.consecutive_failures or 0) + 1
        if feed.consecutive_failures >= 5:
            feed.is_active = False
        run.status = "failed"
        run.error_message = str(exc)[:500]

    run.completed_at = datetime.now(tz=timezone.utc).isoformat()
    run.documents_found = result.documents_found
    run.documents_new = result.documents_new
    run.documents_skipped = result.documents_skipped
    run.documents_failed = result.documents_failed
    await db.commit()
    return result


async def _collect(feed: KnowledgeFeed) -> list[CollectedItem]:
    ftype = feed.type
    cfg = feed.config or {}

    if ftype == "rss":
        from app.services.knowledge.collectors import rss
        return await rss.collect(cfg)
    elif ftype == "arxiv":
        from app.services.knowledge.collectors import arxiv
        return await arxiv.collect(cfg)
    elif ftype == "github_trending":
        from app.services.knowledge.collectors import github_trending
        return await github_trending.collect(cfg)
    elif ftype in ("url",):
        from app.services.knowledge.collectors import url as url_collector
        return await url_collector.collect(cfg)
    elif ftype == "youtube":
        from app.services.knowledge.collectors import youtube as yt_collector
        return await yt_collector.collect(cfg)
    elif ftype == "pdf":
        from app.services.knowledge.collectors import pdf as pdf_collector
        return await pdf_collector.collect(cfg)
    elif ftype == "google_news":
        from app.services.knowledge.collectors import google_news as gn_collector
        return await gn_collector.collect(cfg)
    elif ftype == "sec_edgar":
        from app.services.knowledge.collectors import sec_edgar as sec_collector
        return await sec_collector.collect(cfg)
    else:
        return []


async def _process_item(
    item: CollectedItem,
    feed: KnowledgeFeed,
    db: AsyncSession,
) -> bool:
    """Return True if new document was stored, False if duplicate."""

    clean = _clean_content(item.raw_content)
    if not clean.strip():
        return False

    content_hash = hashlib.sha256(clean.encode()).hexdigest()

    # Run all dedup SELECTs with autoflush disabled.
    # autoflush would try to INSERT any pending doc (from the previous loop
    # iteration) before the SELECT runs, and if that doc has the same hash as
    # an already-committed row, the INSERT fails and the session enters
    # PendingRollbackError — killing every remaining feed in the run.
    with db.no_autoflush:
        existing_hash = await db.execute(
            select(KnowledgeDocument.id).where(
                KnowledgeDocument.workspace_id == feed.workspace_id,
                KnowledgeDocument.content_hash == content_hash,
            )
        )
        if existing_hash.scalar():
            return False

        if item.url:
            existing_url = await db.execute(
                select(KnowledgeDocument.id).where(
                    KnowledgeDocument.workspace_id == feed.workspace_id,
                    KnowledgeDocument.url == item.url,
                )
            )
            if existing_url.scalar():
                return False

    # AI extraction
    extraction = await extract_knowledge(item.title, clean)

    # Embedding
    embedding = None
    try:
        embed_input = f"{item.title}\n\n{extraction.summary or clean[:500]}"
        embeddings = await embed_texts([embed_input])
        if embeddings:
            embedding = embeddings[0]
    except Exception:
        pass

    doc = KnowledgeDocument(
        workspace_id=feed.workspace_id,
        feed_id=feed.id,
        source_type=item.source_type,
        title=item.title,
        url=item.url,
        author=item.author,
        published_at=item.published_at.isoformat() if item.published_at else None,
        collected_at=datetime.now(tz=timezone.utc).isoformat(),
        raw_content=item.raw_content[:20000],
        clean_content=clean[:20000],
        summary=extraction.summary,
        key_insights=extraction.key_insights,
        entities=extraction.entities,
        relationships=extraction.relationships,
        tags=extraction.tags,
        confidence_score=extraction.confidence_score,
        importance_score=extraction.importance_score,
        content_hash=content_hash,
        embedding=embedding,
        status="ready",
        metadata_=item.metadata,
    )
    db.add(doc)
    # Flush inside a savepoint so an unexpected IntegrityError on this single
    # insert rolls back only the savepoint, not the whole session.
    try:
        async with db.begin_nested():
            await db.flush()
    except Exception:
        return False
    return True


def _clean_content(raw: str) -> str:
    if not raw:
        return ""
    # Strip HTML tags
    text = re.sub(r"<[^>]+>", " ", raw)
    # Collapse whitespace
    text = re.sub(r"\s+", " ", text)
    # Remove common junk patterns
    text = re.sub(r"(Share|Tweet|Email|Subscribe|Sign up|Cookie|Privacy Policy)\b.*", "", text)
    return text.strip()
