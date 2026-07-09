from datetime import datetime, timezone

from app.services.knowledge.collectors.base import CollectedItem


async def collect(config: dict) -> list[CollectedItem]:
    url = config.get("url", "")
    if not url:
        return []

    video_id = _extract_video_id(url)
    if not video_id:
        return []

    # Try transcript first
    transcript_text, title = await _get_transcript(video_id)

    if not transcript_text:
        # Fallback: yt-dlp metadata
        transcript_text, title = await _get_metadata(url)

    if not transcript_text:
        return []

    return [CollectedItem(
        title=title or url,
        url=url,
        published_at=datetime.now(tz=timezone.utc),
        raw_content=transcript_text,
        source_type="youtube",
        metadata={"video_id": video_id},
    )]


def _extract_video_id(url: str) -> str | None:
    import re
    patterns = [
        r"(?:v=|youtu\.be/|embed/|v/)([A-Za-z0-9_-]{11})",
    ]
    for p in patterns:
        m = re.search(p, url)
        if m:
            return m.group(1)
    return None


async def _get_transcript(video_id: str) -> tuple[str, str]:
    import asyncio
    def _sync() -> tuple[str, str]:
        try:
            from youtube_transcript_api import YouTubeTranscriptApi
            transcript = YouTubeTranscriptApi.get_transcript(video_id)
            text = " ".join(t["text"] for t in transcript)
            return text, ""
        except Exception:
            return "", ""
    return await asyncio.to_thread(_sync)


async def _get_metadata(url: str) -> tuple[str, str]:
    import asyncio
    def _sync() -> tuple[str, str]:
        try:
            import yt_dlp
            opts = {"quiet": True, "skip_download": True}
            with yt_dlp.YoutubeDL(opts) as ydl:
                info = ydl.extract_info(url, download=False)
                title = info.get("title", "")
                description = info.get("description", "")
                return f"{title}\n\n{description}", title
        except Exception:
            return "", ""
    return await asyncio.to_thread(_sync)
