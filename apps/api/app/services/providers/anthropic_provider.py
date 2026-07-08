"""
Anthropic provider — uses the Messages API with streaming.

To enable: set LLM_PROVIDER=anthropic in .env and ensure
ANTHROPIC_API_KEY is present. Install: pip install anthropic>=0.40.0
"""
from collections.abc import AsyncGenerator

from app.services.providers.base import LLMProvider


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, model: str) -> None:
        try:
            import anthropic
        except ImportError as e:
            raise ImportError(
                "anthropic package is not installed. "
                "Run: pip install 'anthropic>=0.40.0'"
            ) from e

        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = model

    async def stream(
        self,
        system: str,
        messages: list[dict],
    ) -> AsyncGenerator[str, None]:
        import anthropic  # already verified importable in __init__

        async with self._client.messages.stream(
            model=self._model,
            max_tokens=4096,
            system=system,
            messages=messages,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    async def complete(
        self,
        system: str,
        prompt: str,
    ) -> str:
        response = await self._client.messages.create(
            model=self._model,
            max_tokens=4096,
            system=system,
            messages=[{"role": "user", "content": prompt}],
        )
        return response.content[0].text  # type: ignore[union-attr]
