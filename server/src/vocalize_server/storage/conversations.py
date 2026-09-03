import sqlite3
import uuid
from contextlib import contextmanager
from datetime import UTC, datetime
from pathlib import Path

from vocalize_server.schemas import ChatMessage, ConversationSummary

_SCHEMA = """
CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    page_url TEXT,
    title TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_page_url ON conversations(page_url);

CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
"""


class ConversationStore:
    """SQLite-backed conversation history, organized by the page URL each
    conversation was started on. One file on disk (see Settings.data_dir),
    mounted as a volume in docker-compose so history survives restarts."""

    def __init__(self, db_path: str):
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self._db_path = db_path
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

    def create_conversation(self, page_url: str | None, title: str | None) -> str:
        conversation_id = str(uuid.uuid4())
        now = _now()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO conversations (id, page_url, title, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (conversation_id, page_url, title, now, now),
            )
        return conversation_id

    def get_messages(self, conversation_id: str) -> list[ChatMessage]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id ASC",
                (conversation_id,),
            ).fetchall()
        return [ChatMessage(role=row["role"], content=row["content"]) for row in rows]

    def append_message(self, conversation_id: str, message: ChatMessage) -> None:
        now = _now()
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO messages (conversation_id, role, content, created_at) "
                "VALUES (?, ?, ?, ?)",
                (conversation_id, message.role, message.content, now),
            )
            conn.execute(
                "UPDATE conversations SET updated_at = ? WHERE id = ?", (now, conversation_id)
            )

    def list_by_page_url(self, page_url: str, limit: int = 20) -> list[ConversationSummary]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, page_url, title, updated_at FROM conversations "
                "WHERE page_url = ? ORDER BY updated_at DESC LIMIT ?",
                (page_url, limit),
            ).fetchall()
        return [
            ConversationSummary(
                id=row["id"],
                page_url=row["page_url"],
                title=row["title"],
                updated_at=row["updated_at"],
            )
            for row in rows
        ]

    def delete(self, conversation_id: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM conversations WHERE id = ?", (conversation_id,))
            conn.execute("DELETE FROM messages WHERE conversation_id = ?", (conversation_id,))

    def exists(self, conversation_id: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM conversations WHERE id = ?", (conversation_id,)
            ).fetchone()
        return row is not None


def _now() -> str:
    return datetime.now(UTC).isoformat()
