import asyncio
import io

from vocalize_server.tts.base import TTSProvider

KOKORO_VOICES = [
    "af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica", "af_kore",
    "af_nicole", "af_nova", "af_river", "af_sarah", "af_sky",
    "am_adam", "am_echo", "am_eric", "am_fenrir", "am_liam", "am_michael",
    "am_onyx", "am_puck", "am_santa",
    "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
    "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
]  # fmt: skip

KOKORO_SAMPLE_RATE = 24000


class HuggingFaceTTSProvider(TTSProvider):
    """TTS via any Hugging Face repo id.

    Kokoro repos (the default, hexgrad/Kokoro-82M) are loaded through the
    official `kokoro` package — the reference PyTorch implementation, which
    pulls its weights from the HF Hub itself on first use (cached under
    HF_HOME), so there's no separate manual model-download step. Any other
    repo id falls back to a generic transformers text-to-speech pipeline.
    """

    def __init__(self, repo_id: str = "hexgrad/Kokoro-82M", device: str = "cpu"):
        self._repo_id = repo_id
        self._device = device
        self._is_kokoro = "kokoro" in repo_id.lower()
        self._kokoro_pipelines: dict[str, object] = {}
        self._hf_pipeline = None

    def _kokoro_pipeline(self, lang_code: str):
        if lang_code not in self._kokoro_pipelines:
            from kokoro import KPipeline

            self._kokoro_pipelines[lang_code] = KPipeline(
                lang_code=lang_code, repo_id=self._repo_id, device=self._device
            )
        return self._kokoro_pipelines[lang_code]

    def _hf_tts_pipeline(self):
        if self._hf_pipeline is None:
            from transformers import pipeline

            self._hf_pipeline = pipeline("text-to-speech", model=self._repo_id, device=self._device)
        return self._hf_pipeline

    async def synthesize_sentence(self, text: str, voice: str, speed: float) -> bytes:
        # Both lazy pipeline construction (which can hit the network — HF Hub
        # download on first use) and inference must run off the event loop
        # thread; constructing the pipeline synchronously here would freeze
        # every other in-flight request on a slow/stalled download.
        if self._is_kokoro:
            return await asyncio.to_thread(self._synthesize_kokoro_sync, text, voice, speed)
        return await asyncio.to_thread(self._synthesize_generic_sync, text)

    def _synthesize_kokoro_sync(self, text: str, voice: str, speed: float) -> bytes:
        import numpy as np

        lang_code = voice[0] if voice else "a"
        pipeline = self._kokoro_pipeline(lang_code)
        segments = [
            audio.numpy() if hasattr(audio, "numpy") else audio
            for _, _, audio in pipeline(text, voice=voice, speed=speed)
        ]
        samples = np.concatenate(segments) if segments else np.zeros(0, dtype="float32")
        return _pcm_to_wav_bytes(samples, KOKORO_SAMPLE_RATE)

    def _synthesize_generic_sync(self, text: str) -> bytes:
        pipe = self._hf_tts_pipeline()
        result = pipe(text)
        return _pipeline_output_to_wav(result)

    def list_voices(self) -> list[str]:
        return KOKORO_VOICES if self._is_kokoro else []


def _pcm_to_wav_bytes(samples, sample_rate: int) -> bytes:
    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, samples, sample_rate, format="WAV")
    return buf.getvalue()


def _pipeline_output_to_wav(result: dict) -> bytes:
    import soundfile as sf

    buf = io.BytesIO()
    sf.write(buf, result["audio"], result["sampling_rate"], format="WAV")
    return buf.getvalue()
