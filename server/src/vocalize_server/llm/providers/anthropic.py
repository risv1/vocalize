from collections.abc import AsyncIterator

from anthropic import AsyncAnthropic

from vocalize_server.llm.base import LLMProvider
from vocalize_server.schemas import ChatMessage


class AnthropicProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "claude-sonnet-5"):
        self._api_key = api_key
        self._client = AsyncAnthropic(api_key=api_key) if api_key else None
        self._model = model

    async def stream_chat(
        self, messages: list[ChatMessage], model: str | None = None
    ) -> AsyncIterator[str]:
        system = "\n".join(m.content for m in messages if m.role == "system") or None
        turns = [m.model_dump() for m in messages if m.role != "system"]
        async with self._client.messages.stream(
            model=model or self._model,
            max_tokens=1024,
            system=system,
            messages=turns,
        ) as stream:
            async for text in stream.text_stream:
                yield text

    def is_configured(self) -> bool:
        return bool(self._api_key)
