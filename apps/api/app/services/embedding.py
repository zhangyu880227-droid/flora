import voyageai

from app.core.config import settings

_client: voyageai.AsyncClient | None = None


def get_client() -> voyageai.AsyncClient:
    global _client
    if _client is None:
        _client = voyageai.AsyncClient(api_key=settings.voyage_api_key)
    return _client


async def embed_texts(texts: list[str]) -> list[list[float]]:
    client = get_client()
    result = await client.embed(texts, model=settings.voyage_model, input_type="document")
    return result.embeddings


async def embed_query(query: str) -> list[float]:
    client = get_client()
    result = await client.embed([query], model=settings.voyage_model, input_type="query")
    return result.embeddings[0]
