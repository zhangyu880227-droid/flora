"""PDF collector — downloads a PDF from a URL and extracts full text via PyMuPDF."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

import httpx

from app.services.knowledge.collectors.base import CollectedItem


async def collect(config: dict) -> list[CollectedItem]:
    url = config.get("url", "")
    if not url:
        return []

    title = config.get("title") or _title_from_url(url)

    async with httpx.AsyncClient(timeout=60, follow_redirects=True) as client:
        resp = await client.get(url, headers={"User-Agent": "Flora/1.0 (knowledge pipeline)"})
        resp.raise_for_status()
        pdf_bytes = resp.content

    text = await asyncio.to_thread(_extract_text, pdf_bytes)
    if not text.strip():
        return []

    return [CollectedItem(
        title=title,
        url=url,
        published_at=datetime.now(tz=timezone.utc),
        raw_content=text[:30000],
        source_type="pdf",
        metadata={"url": url, "byte_size": len(pdf_bytes)},
    )]


def _extract_text(data: bytes) -> str:
    import fitz  # PyMuPDF
    doc = fitz.open(stream=data, filetype="pdf")
    pages: list[str] = []
    for page in doc:
        text = page.get_text("text")
        if text.strip():
            pages.append(text)
    return "\n\n".join(pages)


def _title_from_url(url: str) -> str:
    import re
    name = url.rstrip("/").split("/")[-1]
    name = re.sub(r"\.pdf$", "", name, flags=re.IGNORECASE)
    name = re.sub(r"[-_]", " ", name)
    return name.strip() or url
