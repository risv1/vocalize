from fastapi import APIRouter, Depends

from vocalize_server.config import Settings, get_settings
from vocalize_server.llm.router import build_llm_provider, known_llm_providers, model_for_provider
from vocalize_server.schemas import ProviderInfo, ProvidersResponse
from vocalize_server.tts.router import known_tts_providers

router = APIRouter()


@router.get("/api/providers", response_model=ProvidersResponse)
async def list_providers(settings: Settings = Depends(get_settings)):
    llm_infos = []
    for name in known_llm_providers():
        candidate = Settings(**{**settings.model_dump(), "llm_provider": name})
        try:
            configured = build_llm_provider(candidate).is_configured()
        except Exception:
            configured = False
        model = model_for_provider(settings, name)
        llm_infos.append(ProviderInfo(name=name, kind="llm", configured=configured, model=model))

    tts_infos = [
        ProviderInfo(name=name, kind="tts", configured=True, model=settings.tts_model_repo)
        for name in known_tts_providers()
    ]

    return ProvidersResponse(
        tts=tts_infos,
        llm=llm_infos,
        active_tts=settings.tts_provider,
        active_llm=settings.llm_provider,
    )
