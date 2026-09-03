#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR/server"
uv run uvicorn vocalize_server.main:app --reload --host "${HOST:-127.0.0.1}" --port "${PORT:-8420}"
