"""Google News RSS collector — wraps the public GNews RSS endpoint."""
from __future__ import annotations

import re
from datetime import datetime, timezone

import feedparser
import httpx

from app.services.knowledge.collectors.base import CollectedItem

_BASE = "https://news.google.com/rss/search"


async def collect(config: dict) -> list[CollectedItem]:
    query = config.get("query", "")
    if not query:
        return []

    max_items = int(config.get("max_items", 20))
    lang = config.get("lang", "en-US")
    country = config.get("country", "US")

    params = {
        "q": query,
        "hl": lang,
        "gl": country,
        "ceid": f"{country}:{lang[:2]}",
    }

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(
            _BASE,
            params=params,
            headers={"User-Agent": "Flora/1.0 (knowledge pipeline)"},
        )
        resp.raise_for_status()
        raw = resp.text

    feed = feedparser.parse(raw)
    items: list[CollectedItem] = []

    for entry in feed.entries[:max_items]:
        title = entry.get("title", "").strip()
        link = entry.get("link", "")
        summary = entry.get("summary", "")

        clean = re.sub(r"<[^>]+>", " ", summary)
        clean = re.sub(r"\s+", " ", clean).strip()

        published: datetime | None = None
        if entry.get("published_parsed"):
            t = entry.published_parsed
            published = datetime(*t[:6], tzinfo=timezone.utc)

        # Google News often includes the source in the title as "Title - Source"
        source = ""
        if " - " in title:
            *title_parts, source = title.split(" - ")
            title = " - ".join(title_parts)

        if not title:
            continue

        items.append(CollectedItem(
            title=title,
            url=link,
            author=source or None,
            published_at=published,
            raw_content=clean or title,
            source_type="google_news",
            metadata={
                "query": query,
                "source_outlet": source,
                "feed_title": feed.feed.get("title", ""),
            },
        ))

    return items
