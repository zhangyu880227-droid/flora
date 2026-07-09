"""
RAG-powered research assistant — provider-agnostic.

The active provider is selected by LLM_PROVIDER in config (default: openai).
To switch to Anthropic: set LLM_PROVIDER=anthropic in .env.
"""
from collections.abc import AsyncGenerator
from functools import lru_cache

from app.core.config import settings
from app.schemas.search import SearchResult
from app.services.providers.base import LLMProvider

SYSTEM_PROMPT = """You are Flora, an AI research assistant. You help researchers synthesize information from their source documents.

When answering questions:
- Ground your answers in the provided source excerpts
- Cite sources inline using [Source: <title>] notation
- Be precise and acknowledge when the sources don't fully address the question
- If you need to reason beyond the sources, clearly distinguish that from source-grounded claims"""


@lru_cache(maxsize=1)
def get_provider() -> LLMProvider:
    match settings.llm_provider:
        case "openai":
            from app.services.providers.openai_provider import OpenAIProvider
            return OpenAIProvider(api_key=settings.openai_api_key, model=settings.openai_model)
        case "anthropic":
            from app.services.providers.anthropic_provider import AnthropicProvider
            if not settings.anthropic_api_key:
                raise ValueError("ANTHROPIC_API_KEY must be set when LLM_PROVIDER=anthropic")
            return AnthropicProvider(api_key=settings.anthropic_api_key, model=settings.anthropic_model)
        case "ollama":
            from app.services.providers.ollama_provider import OllamaProvider
            return OllamaProvider(host=settings.ollama_host, model=settings.ollama_model)
        case _:
            raise ValueError(f"Unknown LLM_PROVIDER: {settings.llm_provider!r}. Use 'openai', 'anthropic', or 'ollama'.")


def _build_context(results: list[SearchResult]) -> str:
    if not results:
        return "No relevant source excerpts found."
    parts = [f"[Source: {r.source_title}]\n{r.content}" for r in results]
    return "\n\n---\n\n".join(parts)


async def stream_response(
    query: str,
    search_results: list[SearchResult],
    conversation_history: list[dict],
) -> AsyncGenerator[str, None]:
    context = _build_context(search_results)
    user_message = f"<sources>\n{context}\n</sources>\n\n{query}"
    messages = [*conversation_history, {"role": "user", "content": user_message}]

    provider = get_provider()
    async for token in provider.stream(system=SYSTEM_PROMPT, messages=messages):
        yield token


async def generate_insight(
    title: str,
    sources_text: str,
    custom_prompt: str | None = None,
) -> str:
    prompt = custom_prompt or (
        f"Generate a comprehensive research insight titled '{title}' based on the following source material. "
        "Include key findings, patterns, and implications. Use clear headings and be analytical."
    )
    full_prompt = f"<sources>\n{sources_text}\n</sources>\n\n{prompt}"

    provider = get_provider()
    return await provider.complete(system=SYSTEM_PROMPT, prompt=full_prompt)
