import feedparser
import httpx

from app.services.knowledge.collectors.base import CollectedItem


async def collect(config: dict) -> list[CollectedItem]:
    url = config.get("url", "")
    max_items = int(config.get("max_items", 20))

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url, headers={"User-Agent": "Flora/1.0 (knowledge pipeline)"})
        resp.raise_for_status()
        raw = resp.text

    feed = feedparser.parse(raw)
    items: list[CollectedItem] = []

    for entry in feed.entries[:max_items]:
        title = entry.get("title", "").strip()
        link = entry.get("link", "")
        author = entry.get("author", "") or entry.get("author_detail", {}).get("name", "")
        summary = entry.get("summary", "") or entry.get("content", [{}])[0].get("value", "")

        # Strip basic HTML tags from summary
        import re
        clean = re.sub(r"<[^>]+>", " ", summary)
        clean = re.sub(r"\s+", " ", clean).strip()

        published = None
        if entry.get("published_parsed"):
            from datetime import timezone
            import time
            t = entry.published_parsed
            published = datetime(*t[:6], tzinfo=timezone.utc)

        if not title:
            continue

        items.append(CollectedItem(
            title=title,
            url=link,
            author=author or None,
            published_at=published,
            raw_content=clean or title,
            source_type="rss",
            metadata={"feed_title": feed.feed.get("title", ""), "feed_url": url},
        ))

    return items


# avoid circular import at module level
from datetime import datetime  # noqa: E402 (used in f-string above)
