from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    host: str = "127.0.0.1"
    port: int = 8420
    cors_origins: list[str] = ["*"]

    # Torch device for any local model (Kokoro TTS, HF LLM/TTS pipelines):
    # "auto" | "cuda" | "mps" | "cpu". "auto" picks CUDA, then Apple Silicon
    # MPS, then falls back to CPU.
    device: str = "auto"

    # TTS
    tts_provider: str = "huggingface"
    tts_model_repo: str = "hexgrad/Kokoro-82M"
    tts_default_voice: str = "af_heart"
    tts_default_speed: float = 1.0

    # LLM
    llm_provider: str = "ollama"  # ollama | huggingface | vllm | anthropic | openai | gemini

    # Each provider keeps its own default model, since "qwen2.5:3b" (an
    # Ollama tag) and "claude-sonnet-5" mean nothing to each other's APIs.
    # The extension can override the model per-request (see ChatRequest.model);
    # these are just the server's fallback when no override is sent.
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "qwen2.5:3b"

    vllm_base_url: str = "http://localhost:8000/v1"
    vllm_model: str = ""

    huggingface_model_repo: str = ""

    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5"

    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"

    # Crawl
    crawl_max_pages: int = 5
    crawl_timeout_seconds: float = 10.0
    crawl_user_agent: str = "VocalizeBot/0.1 (+https://github.com/)"

    # Conversation history (SQLite file at {data_dir}/conversations.db)
    data_dir: str = "data"


@lru_cache
def get_settings() -> Settings:
    return Settings()
