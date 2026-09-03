import hashlib
from collections.abc import AsyncIterator
from functools import lru_cache

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse

from vocalize_server.config import Settings, get_settings
from vocalize_server.schemas import TTSRequest, VoicesResponse
from vocalize_server.storage.audio_cache import AudioCacheStore
from vocalize_server.tts.base import TTSProvider
from vocalize_server.tts.router import get_tts_provider

router = APIRouter()


@lru_cache
def get_audio_cache() -> AudioCacheStore:
    settings = get_settings()
    return AudioCacheStore(
        db_path=f"{settings.data_dir}/audio_cache.db",
        audio_dir=f"{settings.data_dir}/audio_cache",
    )


async def _stream_cached_file(path: str) -> AsyncIterator[bytes]:
    with open(path, "rb") as f:
        while chunk := f.read(65536):
            yield chunk


async def _stream_and_cache(
    provider: TTSProvider,
    text: str,
    voice: str,
    speed: float,
    cache: AudioCacheStore,
    cache_key: dict,
) -> AsyncIterator[bytes]:
    tmp_path = cache.temp_path()
    try:
        with open(tmp_path, "wb") as f:
            async for chunk in provider.stream(text, voice, speed):
                f.write(chunk)
                yield chunk
        cache.commit(tmp_path, **cache_key)
    except Exception:
        cache.discard(tmp_path)
        raise


@router.post("/api/tts")
async def synthesize(request: TTSRequest, settings: Settings = Depends(get_settings)):
    provider = get_tts_provider()
    error = await provider.health_check()
    if error:
        raise HTTPException(503, detail=error)

    voice = request.voice or settings.tts_default_voice
    speed = request.speed or settings.tts_default_speed

    if request.page_url:
        cache = get_audio_cache()
        text_hash = hashlib.sha256(request.text.encode()).hexdigest()
        cache_key = {
            "page_url": request.page_url,
            "text_hash": text_hash,
            "voice": voice,
            "speed": speed,
            "provider": settings.tts_provider,
            "model_repo": settings.tts_model_repo,
        }
        cached_path = cache.find(**cache_key)
        if cached_path:
            return StreamingResponse(
                _stream_cached_file(cached_path), media_type="application/octet-stream"
            )
        return StreamingResponse(
            _stream_and_cache(provider, request.text, voice, speed, cache, cache_key),
            media_type="application/octet-stream",
        )

    return StreamingResponse(
        provider.stream(request.text, voice, speed),
        media_type="application/octet-stream",
    )


@router.get("/api/voices", response_model=VoicesResponse)
async def list_voices(settings: Settings = Depends(get_settings)):
    provider = get_tts_provider()
    voices = provider.list_voices()
    return VoicesResponse(
        provider=settings.tts_provider,
        voices=voices or [settings.tts_default_voice],
        default_voice=settings.tts_default_voice,
    )
