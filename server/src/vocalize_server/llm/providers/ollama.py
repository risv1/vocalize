import json
from collections.abc import AsyncIterator

import httpx

from vocalize_server.llm.base import LLMProvider
from vocalize_server.schemas import ChatMessage


class OllamaProvider(LLMProvider):
    def __init__(self, base_url: str, model: str):
        self._base_url = base_url.rstrip("/")
        self._model = model

    async def stream_chat(
        self, messages: list[ChatMessage], model: str | None = None
    ) -> AsyncIterator[str]:
        payload = {
            "model": model or self._model,
            "messages": [m.model_dump() for m in messages],
            "stream": True,
        }
        async with httpx.AsyncClient(timeout=None) as client, client.stream(
            "POST", f"{self._base_url}/api/chat", json=payload
        ) as response:
            response.raise_for_status()
            async for line in response.aiter_lines():
                if not line.strip():
                    continue
                data = json.loads(line)
                content = data.get("message", {}).get("content", "")
                if content:
                    yield content

    def is_configured(self) -> bool:
        return bool(self._base_url and self._model)

    async def health_check(self) -> str | None:
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                response = await client.get(f"{self._base_url}/api/tags")
                response.raise_for_status()
        except httpx.ConnectError:
            return (
                f"Could not reach Ollama at {self._base_url}. If the Vocalize server is "
                "running in Docker, 'localhost' refers to the container itself — set "
                "OLLAMA_BASE_URL=http://host.docker.internal:11434 in server/.env instead, "
                "and make sure Ollama is running on the host."
            )
        except httpx.HTTPError as error:
            return f"Ollama at {self._base_url} returned an error: {error}"
        return None
