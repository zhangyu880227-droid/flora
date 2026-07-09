import re
from datetime import datetime, timezone

import httpx

from app.services.knowledge.collectors.base import CollectedItem

TRENDING_URL = "https://github.com/trending"


async def collect(config: dict) -> list[CollectedItem]:
    language = config.get("language", "")
    since = config.get("since", "daily")
    max_items = int(config.get("max_items", 15))

    params: dict = {"since": since}
    if language:
        params["l"] = language

    async with httpx.AsyncClient(
        timeout=30,
        follow_redirects=True,
        headers={"User-Agent": "Mozilla/5.0 Flora/1.0"},
    ) as client:
        resp = await client.get(TRENDING_URL, params=params)
        resp.raise_for_status()
        html = resp.text

    items: list[CollectedItem] = []
    now = datetime.now(tz=timezone.utc)

    # Parse trending repos from HTML using regex (avoids bs4 dependency)
    # Each repo article has data-hovercard-url="/owner/repo"
    repo_blocks = re.findall(
        r'<article[^>]*class="[^"]*Box-row[^"]*"[^>]*>(.*?)</article>',
        html,
        re.DOTALL,
    )

    for block in repo_blocks[:max_items]:
        # Extract repo path: href="/owner/repo"
        path_match = re.search(r'href="/([^/"]+/[^/"]+)"[^>]*>\s*\n?\s*<span', block)
        if not path_match:
            # Fallback: find first meaningful href
            path_match = re.search(r'href="/([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+)"', block)
        if not path_match:
            continue
        repo_path = path_match.group(1).strip()
        url = f"https://github.com/{repo_path}"

        # Description
        desc_match = re.search(r'<p[^>]*class="[^"]*color-fg-muted[^"]*"[^>]*>(.*?)</p>', block, re.DOTALL)
        description = ""
        if desc_match:
            description = re.sub(r"<[^>]+>", "", desc_match.group(1)).strip()

        # Language
        lang_match = re.search(r'itemprop="programmingLanguage"[^>]*>(.*?)</span>', block)
        lang = ""
        if lang_match:
            lang = lang_match.group(1).strip()

        # Stars
        stars_match = re.search(r'href="/' + re.escape(repo_path) + r'/stargazers"[^>]*>([\s\S]*?)</a>', block)
        stars = ""
        if stars_match:
            stars = re.sub(r"<[^>]+>", "", stars_match.group(1)).strip().replace(",", "").replace("\n", "").strip()

        title = repo_path
        content_parts = [f"GitHub Repository: {repo_path}"]
        if description:
            content_parts.append(f"Description: {description}")
        if lang:
            content_parts.append(f"Language: {lang}")
        if stars:
            content_parts.append(f"Stars: {stars}")

        items.append(CollectedItem(
            title=title,
            url=url,
            author=repo_path.split("/")[0],
            published_at=now,
            raw_content="\n".join(content_parts),
            source_type="github_trending",
            metadata={
                "repo_path": repo_path,
                "description": description,
                "language": lang,
                "stars": stars,
                "since": since,
            },
        ))

    return items
