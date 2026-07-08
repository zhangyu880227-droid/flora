"""
OpenAI provider — uses the Responses API.

Responses API reference:
  client.responses.create(model, instructions, input, stream)

  - instructions : system-level prompt (replaces {"role": "system"} messages)
  - input        : str | list[{"role": "user"|"assistant", "content": str}]
  - stream=True  : returns an async iterator of ResponseStreamEvent objects
                   text deltas arrive as events with type "response.output_text.delta"
                   and carry the chunk in event.delta
"""
from collections.abc import AsyncGenerator

from openai import AsyncOpenAI

from app.services.providers.base import LLMProvider


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str) -> None:
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model

    async def stream(
        self,
        system: str,
        messages: list[dict],
    ) -> AsyncGenerator[str, None]:
        response = await self._client.responses.create(
            model=self._model,
            instructions=system,
            input=messages,
            stream=True,
        )
        async for event in response:
            if event.type == "response.output_text.delta":
                yield event.delta

    async def complete(
        self,
        system: str,
        prompt: str,
    ) -> str:
        response = await self._client.responses.create(
            model=self._model,
            instructions=system,
            input=prompt,
        )
        return response.output_text
