from datetime import datetime, timezone

import httpx
import trafilatura

from app.services.knowledge.collectors.base import CollectedItem


async def collect(config: dict) -> list[CollectedItem]:
    url = config.get("url", "")
    if not url:
        return []

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(url, headers={"User-Agent": "Flora/1.0"})
        resp.raise_for_status()
        html = resp.text

    result = trafilatura.extract(html, include_comments=False, include_tables=True)
    meta = trafilatura.extract_metadata(html)

    title = (meta.title if meta else None) or url
    author = meta.author if meta else None
    content = result or html[:3000]

    return [CollectedItem(
        title=title,
        url=url,
        author=author,
        published_at=datetime.now(tz=timezone.utc),
        raw_content=content,
        source_type="url",
    )]
