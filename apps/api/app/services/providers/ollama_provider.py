"""
Ollama provider — calls the local Ollama server's native /api/chat endpoint.

Supports streaming and one-shot completion.
Sets think=False to suppress chain-of-thought blocks (qwen3, deepseek-r1, etc.)
so callers always receive clean text or JSON.
"""
import json
from collections.abc import AsyncGenerator

import httpx

from app.services.providers.base import LLMProvider


class OllamaProvider(LLMProvider):
    def __init__(self, host: str, model: str) -> None:
        self._host = host.rstrip("/")
        self._model = model

    def _client(self) -> httpx.AsyncClient:
        # trust_env=False bypasses system HTTP proxies (e.g. Shadowrocket).
        # connect timeout 10s; read timeout 600s for long inference runs.
        timeout = httpx.Timeout(connect=10.0, read=600.0, write=30.0, pool=10.0)
        return httpx.AsyncClient(timeout=timeout, trust_env=False)

    async def _stream_chat(
        self,
        msgs: list[dict],
    ) -> AsyncGenerator[str, None]:
        async with self._client() as client:
            async with client.stream(
                "POST",
                f"{self._host}/api/chat",
                json={"model": self._model, "messages": msgs, "stream": True, "think": False},
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line:
                        continue
                    data = json.loads(line)
                    content = data.get("message", {}).get("content", "")
                    if content:
                        yield content
                    if data.get("done"):
                        break

    async def stream(
        self,
        system: str,
        messages: list[dict],
    ) -> AsyncGenerator[str, None]:
        msgs = [{"role": "system", "content": system}, *messages]
        async for chunk in self._stream_chat(msgs):
            yield chunk

    async def complete(
        self,
        system: str,
        prompt: str,
    ) -> str:
        # Use streaming internally so each token resets the read timeout,
        # avoiding ReadTimeout on long inference runs.
        msgs = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        parts: list[str] = []
        async for chunk in self._stream_chat(msgs):
            parts.append(chunk)
        return "".join(parts)
