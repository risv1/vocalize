from collections.abc import AsyncIterator

from openai import AsyncOpenAI

from vocalize_server.llm.base import LLMProvider
from vocalize_server.schemas import ChatMessage


class OpenAIProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gpt-4o-mini"):
        self._api_key = api_key
        self._client = AsyncOpenAI(api_key=api_key) if api_key else None
        self._model = model

    async def stream_chat(
        self, messages: list[ChatMessage], model: str | None = None
    ) -> AsyncIterator[str]:
        stream = await self._client.chat.completions.create(
            model=model or self._model,
            messages=[m.model_dump() for m in messages],
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    def is_configured(self) -> bool:
        return bool(self._api_key)
