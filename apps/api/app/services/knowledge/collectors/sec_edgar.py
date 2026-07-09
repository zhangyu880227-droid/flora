"""
SEC EDGAR collector — fetches recent SEC filings via the EDGAR full-text RSS feed.

Supports 8-K (major events), 10-K (annual), 10-Q (quarterly), DEF 14A (proxy).
Uses the free, public EDGAR RSS endpoint — no API key required.

Config keys:
  forms      : comma-separated form types, e.g. "8-K,10-K" (default "8-K")
  max_items  : max filings to return (default 20)
  keywords   : optional keyword filter applied to title (list or comma-sep string)
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

import feedparser
import httpx

from app.services.knowledge.collectors.base import CollectedItem

_EDGAR_RSS = "https://efts.sec.gov/LATEST/search-index?q=%22%22&dateRange=custom&startdt={date}&forms={forms}&hits.hits._source=period_of_report,entity_name,file_num,period_of_report,biz_location,inc_states,file_date,form_type&_source=true"

_ATOM_RSS = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type={forms}&dateb=&owner=include&count={count}&search_text=&output=atom"


async def collect(config: dict) -> list[CollectedItem]:
    forms     = config.get("forms", "8-K")
    max_items = int(config.get("max_items", 20))
    keywords: list[str] = []
    raw_kw = config.get("keywords", "")
    if isinstance(raw_kw, list):
        keywords = [k.lower() for k in raw_kw if k]
    elif isinstance(raw_kw, str) and raw_kw.strip():
        keywords = [k.strip().lower() for k in raw_kw.split(",") if k.strip()]

    url = _ATOM_RSS.format(forms=forms.replace(",", "%2C"), count=max_items * 2)

    async with httpx.AsyncClient(timeout=30, follow_redirects=True) as client:
        resp = await client.get(
            url,
            headers={"User-Agent": "Flora Research Platform contact@flora.ai"},
        )
        resp.raise_for_status()

    feed = feedparser.parse(resp.text)
    items: list[CollectedItem] = []

    for entry in feed.entries:
        if len(items) >= max_items:
            break

        title = entry.get("title", "").strip()
        link  = entry.get("link", "")

        if not title:
            continue

        # Optional keyword filter
        if keywords and not any(kw in title.lower() for kw in keywords):
            continue

        summary = entry.get("summary", "") or entry.get("content", [{}])[0].get("value", "")
        clean   = re.sub(r"<[^>]+>", " ", summary)
        clean   = re.sub(r"\s+", " ", clean).strip()

        published: datetime | None = None
        if entry.get("published_parsed"):
            t = entry.published_parsed
            published = datetime(*t[:6], tzinfo=timezone.utc)
        elif entry.get("updated_parsed"):
            t = entry.updated_parsed
            published = datetime(*t[:6], tzinfo=timezone.utc)

        # Extract company name from SEC title format "COMPANY (form_type)"
        company = ""
        m = re.match(r"^(.+?)\s*\(", title)
        if m:
            company = m.group(1).strip()

        items.append(CollectedItem(
            title=title,
            url=link,
            author=company or None,
            published_at=published,
            raw_content=clean or title,
            source_type="sec_edgar",
            metadata={
                "form_type": forms,
                "company": company,
                "filing_url": link,
            },
        ))

    return items
