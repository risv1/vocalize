import pytest

from vocalize_server.config import Settings
from vocalize_server.llm.router import build_llm_provider, known_llm_providers, model_for_provider


@pytest.mark.parametrize("provider_name", known_llm_providers())
def test_build_llm_provider_all_known(provider_name):
    settings = Settings(llm_provider=provider_name)
    provider = build_llm_provider(settings)
    assert provider is not None


def test_build_llm_provider_unknown_raises():
    settings = Settings(llm_provider="nonexistent")
    with pytest.raises(ValueError):
        build_llm_provider(settings)


def test_ollama_is_configured_when_model_and_url_set():
    settings = Settings(llm_provider="ollama", ollama_model="qwen2.5:3b")
    provider = build_llm_provider(settings)
    assert provider.is_configured() is True


def test_anthropic_not_configured_without_key():
    settings = Settings(llm_provider="anthropic", anthropic_api_key="")
    provider = build_llm_provider(settings)
    assert provider.is_configured() is False


def test_anthropic_configured_with_key():
    settings = Settings(llm_provider="anthropic", anthropic_api_key="sk-test")
    provider = build_llm_provider(settings)
    assert provider.is_configured() is True


def test_model_for_provider_returns_each_providers_own_model():
    settings = Settings(
        ollama_model="qwen2.5:3b",
        anthropic_model="claude-sonnet-5",
        openai_model="gpt-4o-mini",
    )
    assert model_for_provider(settings, "ollama") == "qwen2.5:3b"
    assert model_for_provider(settings, "anthropic") == "claude-sonnet-5"
    assert model_for_provider(settings, "openai") == "gpt-4o-mini"
    assert model_for_provider(settings, "nonexistent") == ""


async def test_stream_chat_model_override_takes_precedence(monkeypatch):
    """Ollama's payload uses the per-request model when given, else the
    provider's configured default — the mechanism the extension's
    options-page model override relies on."""
    import json

    import httpx

    from vocalize_server.llm.providers.ollama import OllamaProvider
    from vocalize_server.schemas import ChatMessage

    captured_payloads = []

    async def handler(request: httpx.Request) -> httpx.Response:
        captured_payloads.append(json.loads(request.content))
        return httpx.Response(200, text='{"message": {"content": "hi"}}\n')

    transport = httpx.MockTransport(handler)

    class _PatchedAsyncClient(httpx.AsyncClient):
        def __init__(self, **kwargs):
            kwargs.pop("timeout", None)
            super().__init__(transport=transport)

    import vocalize_server.llm.providers.ollama as ollama_module

    monkeypatch.setattr(ollama_module.httpx, "AsyncClient", _PatchedAsyncClient)

    provider = OllamaProvider(base_url="http://fake-ollama:11434", model="default-model")
    messages = [ChatMessage(role="user", content="hello")]
    async for _ in provider.stream_chat(messages, model="override-model"):
        pass

    assert captured_payloads[0]["model"] == "override-model"
