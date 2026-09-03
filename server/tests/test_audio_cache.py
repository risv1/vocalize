import pytest

from vocalize_server.storage.audio_cache import AudioCacheStore


@pytest.fixture
def cache(tmp_path):
    return AudioCacheStore(
        db_path=str(tmp_path / "audio_cache.db"), audio_dir=str(tmp_path / "audio_cache")
    )


def _key(**overrides):
    key = {
        "page_url": "https://example.com/article",
        "text_hash": "abc123",
        "voice": "af_heart",
        "speed": 1.0,
        "provider": "huggingface",
        "model_repo": "hexgrad/Kokoro-82M",
    }
    key.update(overrides)
    return key


def test_miss_when_nothing_cached(cache):
    assert cache.find(**_key()) is None


def test_commit_then_find_hits(cache):
    tmp_path = cache.temp_path()
    with open(tmp_path, "wb") as f:
        f.write(b"fake-wav-bytes")

    cache.commit(tmp_path, **_key())

    found = cache.find(**_key())
    assert found is not None
    with open(found, "rb") as f:
        assert f.read() == b"fake-wav-bytes"


def test_different_voice_is_a_miss(cache):
    tmp_path = cache.temp_path()
    with open(tmp_path, "wb") as f:
        f.write(b"data")
    cache.commit(tmp_path, **_key())

    assert cache.find(**_key(voice="am_adam")) is None


def test_different_model_is_a_miss(cache):
    tmp_path = cache.temp_path()
    with open(tmp_path, "wb") as f:
        f.write(b"data")
    cache.commit(tmp_path, **_key())

    assert cache.find(**_key(model_repo="some/other-model")) is None


def test_discard_removes_temp_file(cache):
    tmp_path = cache.temp_path()
    with open(tmp_path, "wb") as f:
        f.write(b"data")

    cache.discard(tmp_path)

    from pathlib import Path

    assert not Path(tmp_path).exists()
