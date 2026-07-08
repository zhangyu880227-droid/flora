from pydantic import BaseModel


class SearchRequest(BaseModel):
    query: str
    project_id: str
    collection_id: str | None = None
    limit: int = 8


class SearchResult(BaseModel):
    chunk_id: str
    source_id: str
    source_title: str
    source_type: str
    content: str
    score: float
    chunk_index: int


class SearchResponse(BaseModel):
    results: list[SearchResult]
    query: str
    total_results: int
