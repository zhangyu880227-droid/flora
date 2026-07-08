"""
Source ingestion: text extraction + chunking + embedding storage.
Called from Celery tasks; all I/O is synchronous at the task layer
but async at the service layer for DB writes.
"""
import os
import uuid
from pathlib import Path

from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.source import Source, SourceChunk, SourceStatus
from app.services.embedding import embed_texts

_splitter = RecursiveCharacterTextSplitter(
    chunk_size=512,
    chunk_overlap=64,
    separators=["\n\n", "\n", ". ", " ", ""],
)


def extract_pdf(file_path: str) -> str:
    import fitz  # PyMuPDF

    doc = fitz.open(file_path)
    return "\n\n".join(page.get_text() for page in doc)


def extract_url(url: str) -> tuple[str, str]:
    import trafilatura

    downloaded = trafilatura.fetch_url(url)
    if not downloaded:
        raise ValueError(f"Failed to fetch URL: {url}")
    result = trafilatura.extract(downloaded, include_comments=False, include_tables=True)
    if not result:
        raise ValueError("No content extracted from URL")
    meta = trafilatura.extract_metadata(downloaded)
    title = (meta.title if meta and meta.title else url) or url
    return result, title


def extract_youtube(url: str) -> tuple[str, str]:
    import yt_dlp

    ydl_opts = {"writesubtitles": True, "writeautomaticsub": True, "skip_download": True, "quiet": True}
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(url, download=False)
        title = info.get("title", url) if info else url
        description = info.get("description", "") if info else ""
    return description or "", str(title)


async def process_source(source_id: uuid.UUID, db: AsyncSession) -> None:
    source = await db.get(Source, source_id)
    if not source:
        return

    try:
        source.status = SourceStatus.processing
        await db.commit()

        raw_text, title = _extract(source)
        source.raw_text = raw_text
        if title and source.title == source.url:
            source.title = title[:500]

        chunks = _splitter.split_text(raw_text)
        embeddings = await embed_texts(chunks)

        for i, (chunk_text, embedding) in enumerate(zip(chunks, embeddings)):
            db.add(SourceChunk(
                source_id=source.id,
                content=chunk_text,
                chunk_index=i,
                embedding=embedding,
            ))

        source.status = SourceStatus.ready
        await db.commit()

    except Exception as exc:
        source.status = SourceStatus.error
        source.error_message = str(exc)[:1000]
        await db.commit()
        raise


def _extract(source: Source) -> tuple[str, str]:
    match source.type.value:
        case "pdf":
            if not source.file_path:
                raise ValueError("No file_path for PDF source")
            return extract_pdf(source.file_path), source.title
        case "url":
            if not source.url:
                raise ValueError("No URL for URL source")
            return extract_url(source.url)
        case "youtube":
            if not source.url:
                raise ValueError("No URL for YouTube source")
            return extract_youtube(source.url)
        case "note":
            return source.raw_text or "", source.title
        case "arxiv":
            if not source.url:
                raise ValueError("No URL for arXiv source")
            return extract_url(source.url)
        case _:
            raise ValueError(f"Unknown source type: {source.type}")
