import asyncio
from collections.abc import AsyncIterator

from vocalize_server.llm.base import LLMProvider
from vocalize_server.schemas import ChatMessage


class HuggingFaceLLMProvider(LLMProvider):
    """Runs a Hugging Face `transformers` text-generation model locally."""

    def __init__(self, repo_id: str, device: str = "cpu"):
        self._repo_id = repo_id
        self._device = device
        self._pipelines: dict[str, object] = {}

    def _load(self, repo_id: str):
        if repo_id not in self._pipelines:
            from transformers import pipeline

            self._pipelines[repo_id] = pipeline(
                "text-generation", model=repo_id, device=self._device
            )
        return self._pipelines[repo_id]

    async def stream_chat(
        self, messages: list[ChatMessage], model: str | None = None
    ) -> AsyncIterator[str]:
        # _load can hit the network (HF Hub download on first use), so it
        # must run in the thread too — not synchronously before to_thread —
        # or a slow download freezes every other in-flight request.
        repo_id = model or self._repo_id
        prompt = "\n".join(f"{m.role}: {m.content}" for m in messages)
        result = await asyncio.to_thread(self._generate_sync, repo_id, prompt)
        yield result

    def _generate_sync(self, repo_id: str, prompt: str) -> str:
        pipe = self._load(repo_id)
        result = pipe(prompt, max_new_tokens=512, return_full_text=False)
        return result[0]["generated_text"]

    def is_configured(self) -> bool:
        return bool(self._repo_id)
