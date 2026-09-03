from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

from vocalize_server.schemas import ChatMessage


class LLMProvider(ABC):
    """A chat-capable LLM backend. Streams response text token/chunk by chunk."""

    @abstractmethod
    def stream_chat(
        self, messages: list[ChatMessage], model: str | None = None
    ) -> AsyncIterator[str]:
        """`model` overrides the provider's configured default for this request only."""
        raise NotImplementedError

    def is_configured(self) -> bool:
        return True

    async def health_check(self) -> str | None:
        """Return None if the provider looks reachable/usable, otherwise a
        human-readable error to surface to the caller before streaming starts."""
        return None
