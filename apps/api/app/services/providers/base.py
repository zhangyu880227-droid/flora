from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator


class LLMProvider(ABC):
    """
    Abstract LLM provider. Implement this to add a new backend
    (OpenAI, Anthropic, Gemini, local, …).

    Both methods receive a system prompt and a flat list of
    {"role": "user"|"assistant", "content": "..."} turns.
    """

    @abstractmethod
    async def stream(
        self,
        system: str,
        messages: list[dict],
    ) -> AsyncGenerator[str, None]:
        """Yield text tokens as they arrive."""
        ...

    @abstractmethod
    async def complete(
        self,
        system: str,
        prompt: str,
    ) -> str:
        """Return a single, complete response string."""
        ...
