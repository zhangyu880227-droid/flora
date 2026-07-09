import xml.etree.ElementTree as ET
from datetime import datetime, timezone

import httpx

from app.services.knowledge.collectors.base import CollectedItem

ARXIV_API = "https://export.arxiv.org/api/query"
NS = {
    "atom": "http://www.w3.org/2005/Atom",
    "arxiv": "http://arxiv.org/schemas/atom",
}


async def collect(config: dict) -> list[CollectedItem]:
    query = config.get("query", "cat:cs.AI")
    max_results = int(config.get("max_results", 10))
    sort_by = config.get("sort_by", "submittedDate")

    params = {
        "search_query": query,
        "max_results": max_results,
        "sortBy": sort_by,
        "sortOrder": "descending",
    }

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(ARXIV_API, params=params)
        resp.raise_for_status()

    root = ET.fromstring(resp.text)
    items: list[CollectedItem] = []

    for entry in root.findall("atom:entry", NS):
        title_el = entry.find("atom:title", NS)
        summary_el = entry.find("atom:summary", NS)
        published_el = entry.find("atom:published", NS)
        id_el = entry.find("atom:id", NS)

        title = (title_el.text or "").strip().replace("\n", " ") if title_el is not None else ""
        abstract = (summary_el.text or "").strip().replace("\n", " ") if summary_el is not None else ""
        arxiv_id = (id_el.text or "").strip() if id_el is not None else ""

        authors = []
        for author_el in entry.findall("atom:author", NS):
            name_el = author_el.find("atom:name", NS)
            if name_el is not None and name_el.text:
                authors.append(name_el.text.strip())

        published = None
        if published_el is not None and published_el.text:
            try:
                published = datetime.fromisoformat(published_el.text.replace("Z", "+00:00"))
            except ValueError:
                pass

        categories = []
        for cat_el in entry.findall("arxiv:primary_category", NS):
            term = cat_el.get("term", "")
            if term:
                categories.append(term)

        if not title:
            continue

        content = f"{title}\n\n{abstract}"
        items.append(CollectedItem(
            title=title,
            url=arxiv_id,
            author=", ".join(authors[:3]) if authors else None,
            published_at=published,
            raw_content=content,
            source_type="arxiv",
            metadata={
                "abstract": abstract,
                "categories": categories,
                "authors": authors,
                "arxiv_id": arxiv_id,
            },
        ))

    return items
