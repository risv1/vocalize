import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

_SCHEMA = """
CREATE TABLE IF NOT EXISTS audio_cache (
    id TEXT PRIMARY KEY,
    page_url TEXT NOT NULL,
    text_hash TEXT NOT NULL,
    voice TEXT NOT NULL,
    speed REAL NOT NULL,
    provider TEXT NOT NULL,
    model_repo TEXT NOT NULL,
    created_at TEXT NOT NULL,
    byte_size INTEGER NOT NULL,
    UNIQUE(page_url, text_hash, voice, speed, provider, model_repo)
);
"""


class AudioCacheStore:
    """Caches synthesized audio (the exact framed bytes /api/tts streams)
    on disk, keyed by page URL + a hash of the text + voice + speed +
    provider + model — so re-visiting a page you've already had narrated,
    with the same voice/model, replays instantly instead of re-synthesizing.
    A different voice, model, or changed page text is a cache miss by
    design (the key wouldn't match), not a bug.
    """

    def __init__(self, db_path: str, audio_dir: str):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        Path(audio_dir).mkdir(parents=True, exist_ok=True)
        self._db_path = db_path
        self._audio_dir = Path(audio_dir)
        with self._connect() as conn:
            conn.executescript(_SCHEMA)

    @contextmanager
    def _connect(self):
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def temp_path(self) -> str:
        return str(self._audio_dir / f"tmp-{uuid.uuid4()}.bin")

    def find(
        self,
        page_url: str,
        text_hash: str,
        voice: str,
        speed: float,
        provider: str,
        model_repo: str,
    ) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id FROM audio_cache WHERE page_url = ? AND text_hash = ? AND voice = ? "
                "AND speed = ? AND provider = ? AND model_repo = ?",
                (page_url, text_hash, voice, speed, provider, model_repo),
            ).fetchone()
        if not row:
            return None
        path = self._audio_dir / f"{row['id']}.bin"
        return str(path) if path.exists() else None

    def commit(
        self,
        tmp_path: str,
        page_url: str,
        text_hash: str,
        voice: str,
        speed: float,
        provider: str,
        model_repo: str,
    ) -> None:
        cache_id = str(uuid.uuid4())
        final_path = self._audio_dir / f"{cache_id}.bin"
        Path(tmp_path).rename(final_path)
        with self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO audio_cache "
                "(id, page_url, text_hash, voice, speed, provider, model_repo, "
                "created_at, byte_size) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    cache_id,
                    page_url,
                    text_hash,
                    voice,
                    speed,
                    provider,
                    model_repo,
                    datetime.now(UTC).isoformat(),
                    final_path.stat().st_size,
                ),
            )

    def discard(self, tmp_path: str) -> None:
        Path(tmp_path).unlink(missing_ok=True)
