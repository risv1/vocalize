# Vocalize

A self-hosted text-to-speech + LLM system: a Python server that narrates web
pages and answers questions about them, and a Chrome extension that
intelligently extracts a page's real article content (skipping nav, sidebars,
ads) and gives you playback controls, region selection, and an AI chat panel
with its own voice. Still kinda bad but works for now.

## Quick start

```bash
make setup    # uv sync, npm install, creates server/.env
make dev      # starts the server on :8420
make build    # builds extension/dist
```

Then load `extension/dist` as an unpacked extension: `chrome://extensions` →
enable Developer mode → **Load unpacked** → select `extension/dist`.

Click the toolbar icon, confirm/set the server URL if the popup shows a
warning, pick a voice, and hit **Read page**. The first TTS/LLM request that
needs a local model (Kokoro, or a Hugging Face LLM) downloads its weights
from the HF Hub on the fly — expect a slower first request.

Run `make` (or just open the `Makefile`) to see every available target. The
underlying scripts still work directly from `scripts/` if you'd rather not
use `make`.

### Running the server in Docker instead

```bash
cp .env.example server/.env   # if you haven't already via make setup
make docker-build
make docker-up               # server on :8420
make docker-logs
make docker-down
```

`make docker-refresh` tears the container and its volumes down and rebuilds
from scratch — useful after changing extras/dependencies.

The image defaults to the `kokoro` TTS extra. For the generic Hugging Face
TTS/LLM providers (which pull in `transformers`/`torch`), build with
`docker compose build --build-arg EXTRAS=huggingface` instead.

**Docker networking note:** if `LLM_PROVIDER=ollama` or `vllm` and Ollama/vLLM
run on your host machine (not in this compose file), `OLLAMA_BASE_URL`/
`VLLM_BASE_URL` must point at `host.docker.internal`, not `localhost` —
inside the container, `localhost` means the container itself. See the
comments in `.env.example`.

## Configuring providers

Everything is driven by `server/.env` (copied from `.env.example`):

- `DEVICE=auto|cuda|mps|cpu` — torch device for local models. `auto` picks
  CUDA, then Apple Silicon MPS, then CPU.
- `TTS_PROVIDER=huggingface` (the only implemented option) + `TTS_MODEL_REPO`
  — defaults to Kokoro (`hexgrad/Kokoro-82M`, loaded via the `kokoro`
  package); any other HF TTS repo id falls back to a generic `transformers`
  pipeline.
- `LLM_PROVIDER=ollama|vllm|huggingface|anthropic|openai|gemini` — each
  provider has its own model setting (`OLLAMA_MODEL`, `ANTHROPIC_MODEL`,
  etc.) plus API key/base URL where relevant. API keys stay server-side; the
  extension only ever stores the server URL, so one server can be shared
  without exposing secrets to the browser. The extension can override the
  model per-request without touching `.env`.

The extension's options page (right-click the toolbar icon → Options) shows
which providers are configured (and their model), and lets you pick voice,
playback speed, theme, whether chat/insight responses are spoken aloud, and
whether related pages may be crawled for extra chat context.

## Conversation history

Chat conversations are persisted server-side in SQLite
(`{DATA_DIR}/conversations.db`, default `server/data/`), keyed by the page
URL they were started on. The extension creates or resumes a conversation
per page automatically, so closing and reopening the popup doesn't lose the
chat — only the extension's own settings (server URL, voice, etc., in
`chrome.storage.local`) and this server-side history need to persist, and
both now do.

## Development

```bash
make lint    # ruff (server) + eslint (extension)
make test    # pytest (server) + vitest (extension)
```

Or per-project, if you need finer control:

```bash
cd server && uv run ruff check . && uv run pytest
cd extension && npm run lint && npm test && npm run dev   # dev has Vite HMR
```

## Notes

- Audio streams sentence-by-sentence (length-prefixed WAV frames) so
  narration starts before the whole page has been synthesized, and so
  "restart"/region playback has natural seek points.
- The offscreen document (`extension/src/offscreen/`) exists because MV3
  service workers have no `AudioContext` — Chrome only, per `chrome.offscreen`.
- Crawling always checks `robots.txt` via `urllib.robotparser` before
  fetching a linked page, and is bounded by `CRAWL_MAX_PAGES` /
  `CRAWL_TIMEOUT_SECONDS`.
