import pytest

from vocalize_server.config import Settings
from vocalize_server.tts.base import frame_audio_chunk, split_sentences
from vocalize_server.tts.router import build_tts_provider


def test_split_sentences_basic():
    text = "Hello world. This is a test! Is it working?"
    assert split_sentences(text) == [
        "Hello world.",
        "This is a test!",
        "Is it working?",
    ]


def test_split_sentences_empty():
    assert split_sentences("   ") == []


def test_split_sentences_no_terminal_punctuation():
    assert split_sentences("just one fragment") == ["just one fragment"]


def test_frame_audio_chunk_length_prefix():
    payload = b"RIFF...fake-wav-bytes"
    framed = frame_audio_chunk(payload)
    length = int.from_bytes(framed[:4], "big")
    assert length == len(payload)
    assert framed[4:] == payload


def test_build_tts_provider_huggingface():
    settings = Settings(tts_provider="huggingface", tts_model_repo="hexgrad/Kokoro-82M")
    provider = build_tts_provider(settings)
    assert provider.__class__.__name__ == "HuggingFaceTTSProvider"


def test_build_tts_provider_unknown_raises():
    settings = Settings(tts_provider="nonexistent")
    with pytest.raises(ValueError):
        build_tts_provider(settings)


def test_huggingface_provider_detects_kokoro_repo():
    settings = Settings(tts_provider="huggingface", tts_model_repo="hexgrad/Kokoro-82M")
    provider = build_tts_provider(settings)
    assert provider.list_voices()  # Kokoro's known voice list, non-empty


def test_huggingface_provider_non_kokoro_repo_has_no_fixed_voices():
    settings = Settings(tts_provider="huggingface", tts_model_repo="microsoft/speecht5_tts")
    provider = build_tts_provider(settings)
    assert provider.list_voices() == []
