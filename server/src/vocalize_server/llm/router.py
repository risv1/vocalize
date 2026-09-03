from functools import lru_cache

from vocalize_server.config import Settings, get_settings
from vocalize_server.llm.base import LLMProvider


def build_llm_provider(settings: Settings) -> LLMProvider:
    provider = settings.llm_provider
    if provider == "ollama":
        from vocalize_server.llm.providers.ollama import OllamaProvider

        return OllamaProvider(base_url=settings.ollama_base_url, model=settings.ollama_model)
    if provider == "vllm":
        from vocalize_server.llm.providers.vllm import VLLMProvider

        return VLLMProvider(base_url=settings.vllm_base_url, model=settings.vllm_model)
    if provider == "huggingface":
        from vocalize_server.llm.providers.huggingface import HuggingFaceLLMProvider

        return HuggingFaceLLMProvider(repo_id=settings.huggingface_model_repo)
    if provider == "anthropic":
        from vocalize_server.llm.providers.anthropic import AnthropicProvider

        return AnthropicProvider(api_key=settings.anthropic_api_key, model=settings.anthropic_model)
    if provider == "openai":
        from vocalize_server.llm.providers.openai import OpenAIProvider

        return OpenAIProvider(api_key=settings.openai_api_key, model=settings.openai_model)
    if provider == "gemini":
        from vocalize_server.llm.providers.gemini import GeminiProvider

        return GeminiProvider(api_key=settings.gemini_api_key, model=settings.gemini_model)
    raise ValueError(f"Unknown LLM provider: {provider}")


def model_for_provider(settings: Settings, provider_name: str) -> str:
    return {
        "ollama": settings.ollama_model,
        "vllm": settings.vllm_model,
        "huggingface": settings.huggingface_model_repo,
        "anthropic": settings.anthropic_model,
        "openai": settings.openai_model,
        "gemini": settings.gemini_model,
    }.get(provider_name, "")


@lru_cache
def get_llm_provider() -> LLMProvider:
    return build_llm_provider(get_settings())


def known_llm_providers() -> list[str]:
    return ["ollama", "vllm", "huggingface", "anthropic", "openai", "gemini"]
