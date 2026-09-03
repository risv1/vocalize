from collections.abc import AsyncIterator

import httpx
from openai import AsyncOpenAI

from vocalize_server.llm.base import LLMProvider
from vocalize_server.schemas import ChatMessage


class VLLMProvider(LLMProvider):
    """vLLM's OpenAI-compatible server, reached via the openai SDK."""

    def __init__(self, base_url: str, model: str):
        self._base_url = base_url
        self._client = AsyncOpenAI(base_url=base_url, api_key="not-needed")
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
        return bool(self._model)

    async def health_check(self) -> str | None:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(f"{self._base_url.rstrip('/')}/models")
                response.raise_for_status()
        except httpx.ConnectError:
            return (
                f"Could not reach the vLLM server at {self._base_url}. If the Vocalize "
                "server is running in Docker, 'localhost' refers to the container itself — "
                "set VLLM_BASE_URL=http://host.docker.internal:8000/v1 in server/.env instead."
            )
        except httpx.HTTPError as error:
            return f"vLLM server at {self._base_url} returned an error: {error}"
        return None
