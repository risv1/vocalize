import re
import struct
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'])")


def split_sentences(text: str) -> list[str]:
    """Split text into sentence-sized chunks for progressive TTS streaming."""
    text = text.strip()
    if not text:
        return []
    parts = [p.strip() for p in _SENTENCE_SPLIT_RE.split(text) if p.strip()]
    return parts or [text]


def frame_audio_chunk(wav_bytes: bytes) -> bytes:
    """Length-prefix a WAV chunk (4-byte big-endian length) so a streaming
    HTTP client can split the response back into individual sentence clips."""
    return struct.pack(">I", len(wav_bytes)) + wav_bytes


class TTSProvider(ABC):
    """A provider that turns text into one WAV clip per sentence."""

    @abstractmethod
    async def synthesize_sentence(self, text: str, voice: str, speed: float) -> bytes:
        """Return raw WAV bytes for a single sentence."""
        raise NotImplementedError

    async def stream(self, text: str, voice: str, speed: float) -> AsyncIterator[bytes]:
        for sentence in split_sentences(text):
            wav_bytes = await self.synthesize_sentence(sentence, voice, speed)
            yield frame_audio_chunk(wav_bytes)

    def list_voices(self) -> list[str]:
        """Known voice names for this provider, if enumerable. Empty means
        the provider doesn't expose a fixed voice list (e.g. arbitrary HF repos)."""
        return []

    async def health_check(self) -> str | None:
        """Return None if the provider looks ready to synthesize, otherwise a
        human-readable error to surface to the caller before streaming starts."""
        return None
