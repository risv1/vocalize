from collections.abc import AsyncIterator

from vocalize_server.llm.base import LLMProvider
from vocalize_server.schemas import ChatMessage


class GeminiProvider(LLMProvider):
    def __init__(self, api_key: str, model: str = "gemini-2.0-flash"):
        self._api_key = api_key
        self._model = model
        self._client = None
        if api_key:
            from google import genai

            self._client = genai.Client(api_key=api_key)

    async def stream_chat(
        self, messages: list[ChatMessage], model: str | None = None
    ) -> AsyncIterator[str]:
        system = "\n".join(m.content for m in messages if m.role == "system") or None
        contents = "\n\n".join(
            f"{m.role}: {m.content}" for m in messages if m.role != "system"
        )
        response = await self._client.aio.models.generate_content_stream(
            model=model or self._model,
            contents=contents,
            config={"system_instruction": system} if system else None,
        )
        async for chunk in response:
            if chunk.text:
                yield chunk.text

    def is_configured(self) -> bool:
        return bool(self._api_key)
