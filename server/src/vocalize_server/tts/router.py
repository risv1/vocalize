from functools import lru_cache

from vocalize_server.config import Settings, get_settings
from vocalize_server.device import resolve_device
from vocalize_server.tts.base import TTSProvider


def build_tts_provider(settings: Settings) -> TTSProvider:
    if settings.tts_provider == "huggingface":
        from vocalize_server.tts.providers.huggingface import HuggingFaceTTSProvider

        return HuggingFaceTTSProvider(
            repo_id=settings.tts_model_repo, device=resolve_device(settings.device)
        )
    raise ValueError(f"Unknown TTS provider: {settings.tts_provider}")


@lru_cache
def get_tts_provider() -> TTSProvider:
    return build_tts_provider(get_settings())


def known_tts_providers() -> list[str]:
    return ["huggingface"]
