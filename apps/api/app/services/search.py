"""
Hybrid search: pgvector cosine similarity + PostgreSQL full-text search,
fused with Reciprocal Rank Fusion (RRF, k=60).
"""
from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.source import Source, SourceChunk, SourceStatus
from app.schemas.search import SearchResult
from app.services.embedding import embed_query

RRF_K = 60
CANDIDATE_LIMIT = 20


async def hybrid_search(
    query: str,
    project_id: UUID,
    db: AsyncSession,
    collection_id: UUID | None = None,
    limit: int = 8,
) -> list[SearchResult]:
    query_embedding = await embed_query(query)

    # Subquery: only chunks from ready sources in this project
    source_filter = (
        "sources.project_id = :project_id AND sources.status = 'ready'"
    )
    collection_join = ""
    if collection_id:
        collection_join = (
            "JOIN collection_sources cs ON cs.source_id = sc.source_id "
            "AND cs.collection_id = :collection_id "
        )
        source_filter += " AND cs.collection_id = :collection_id"

    vector_sql = text(f"""
        SELECT sc.id::text AS chunk_id,
               sc.source_id::text,
               sc.content,
               sc.chunk_index,
               s.title AS source_title,
               s.type::text AS source_type,
               1 - (sc.embedding <=> CAST(:embedding AS vector)) AS score
        FROM source_chunks sc
        JOIN sources s ON s.id = sc.source_id
        {collection_join}
        WHERE {source_filter}
          AND sc.embedding IS NOT NULL
        ORDER BY sc.embedding <=> CAST(:embedding AS vector)
        LIMIT :limit
    """)

    fts_sql = text(f"""
        SELECT sc.id::text AS chunk_id,
               sc.source_id::text,
               sc.content,
               sc.chunk_index,
               s.title AS source_title,
               s.type::text AS source_type,
               ts_rank_cd(to_tsvector('english', sc.content), plainto_tsquery('english', :query)) AS score
        FROM source_chunks sc
        JOIN sources s ON s.id = sc.source_id
        {collection_join}
        WHERE {source_filter}
          AND to_tsvector('english', sc.content) @@ plainto_tsquery('english', :query)
        ORDER BY score DESC
        LIMIT :limit
    """)

    params: dict = {
        "embedding": str(query_embedding),
        "query": query,
        "project_id": str(project_id),
        "limit": CANDIDATE_LIMIT,
    }
    if collection_id:
        params["collection_id"] = str(collection_id)

    vector_rows = (await db.execute(vector_sql, params)).mappings().all()
    fts_rows = (await db.execute(fts_sql, params)).mappings().all()

    return _rrf_fuse(vector_rows, fts_rows, limit)


def _rrf_fuse(vector_rows: list, fts_rows: list, limit: int) -> list[SearchResult]:
    scores: dict[str, float] = {}
    meta: dict[str, dict] = {}

    for rank, row in enumerate(vector_rows):
        cid = row["chunk_id"]
        scores[cid] = scores.get(cid, 0) + 1 / (RRF_K + rank + 1)
        meta[cid] = dict(row)

    for rank, row in enumerate(fts_rows):
        cid = row["chunk_id"]
        scores[cid] = scores.get(cid, 0) + 1 / (RRF_K + rank + 1)
        if cid not in meta:
            meta[cid] = dict(row)

    ranked = sorted(scores.items(), key=lambda x: x[1], reverse=True)[:limit]

    return [
        SearchResult(
            chunk_id=cid,
            source_id=meta[cid]["source_id"],
            source_title=meta[cid]["source_title"],
            source_type=meta[cid]["source_type"],
            content=meta[cid]["content"],
            score=score,
            chunk_index=meta[cid]["chunk_index"],
        )
        for cid, score in ranked
    ]
