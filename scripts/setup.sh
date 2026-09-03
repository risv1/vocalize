#!/usr/bin/env bash
# Orchestrates first-time setup: Python deps (uv), extension deps (npm),
# .env creation, and an optional Ollama model pull for the default LLM provider.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "== Vocalize setup =="

if ! command -v uv >/dev/null 2>&1; then
  echo "error: 'uv' is not installed. Install it: https://docs.astral.sh/uv/getting-started/installation/" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "error: 'node' is not installed. Install Node 18+ before continuing." >&2
  exit 1
fi

echo "-- Installing server dependencies (uv sync) --"
(cd "$ROOT_DIR/server" && uv sync)

echo "-- Installing extension dependencies (npm install) --"
(cd "$ROOT_DIR/extension" && npm install)

if [ ! -f "$ROOT_DIR/server/.env" ]; then
  echo "-- Creating server/.env from .env.example --"
  cp "$ROOT_DIR/.env.example" "$ROOT_DIR/server/.env"
else
  echo "-- server/.env already exists, leaving it alone --"
fi

DEFAULT_PROVIDER="$(grep -E '^LLM_PROVIDER=' "$ROOT_DIR/server/.env" | cut -d= -f2 || true)"

if [ "$DEFAULT_PROVIDER" = "ollama" ]; then
  if command -v ollama >/dev/null 2>&1; then
    MODEL="$(grep -E '^LLM_MODEL=' "$ROOT_DIR/server/.env" | cut -d= -f2 || echo qwen2.5:3b)"
    read -r -p "Pull default Ollama model '$MODEL' now? [Y/n] " reply
    if [[ ! "$reply" =~ ^[Nn]$ ]]; then
      ollama pull "$MODEL"
    fi
  else
    echo "note: LLM_PROVIDER=ollama but the 'ollama' binary was not found — install it from https://ollama.com if you want local LLM inference." >&2
  fi
fi

TTS_PROVIDER="$(grep -E '^TTS_PROVIDER=' "$ROOT_DIR/server/.env" | cut -d= -f2 || true)"
if [ "$TTS_PROVIDER" = "kokoro_onnx" ]; then
  echo
  echo "note: kokoro_onnx needs model weights downloaded once. Run:"
  echo "    $ROOT_DIR/scripts/download-kokoro.sh"
fi

echo
echo "Setup complete."
echo "  1. Start the server:      scripts/dev-server.sh"
echo "  2. Build the extension:   scripts/build-extension.sh"
echo "  3. Load extension/dist as an unpacked extension in chrome://extensions"
