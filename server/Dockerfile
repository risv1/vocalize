# Vocalize server image. Defaults to the `kokoro` extra (official PyTorch
# Kokoro TTS, weights pulled from the HF Hub on first use); pass
# --build-arg EXTRAS=huggingface (or "kokoro,huggingface") to also pull in
# transformers/torch for the generic Hugging Face TTS/LLM providers.
FROM ghcr.io/astral-sh/uv:python3.11-bookworm-slim

ARG EXTRAS=kokoro

# libsndfile1: required by `soundfile` for WAV encoding.
# espeak-ng: phonemizer backend used by kokoro/misaki.
# curl: used by the HEALTHCHECK below.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 \
    espeak-ng \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/app/hf_cache

# Install dependencies first so the layer is cached across source changes.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --extra "$EXTRAS"

COPY src/ ./src/
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --extra "$EXTRAS"

# hf_cache: downloaded model weights (Kokoro etc.), so they aren't
# re-fetched from the HF Hub on every container restart.
# data: SQLite conversation history (see storage/conversations.py).
VOLUME ["/app/hf_cache", "/app/data"]

EXPOSE 8420

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s \
    CMD curl -f http://127.0.0.1:8420/api/health || exit 1

CMD ["uv", "run", "uvicorn", "vocalize_server.main:app", "--host", "0.0.0.0", "--port", "8420"]
