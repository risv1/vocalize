import pytest

from vocalize_server.schemas import ChatMessage
from vocalize_server.storage.conversations import ConversationStore


@pytest.fixture
def store(tmp_path):
    return ConversationStore(db_path=str(tmp_path / "conversations.db"))


def test_create_and_exists(store):
    conversation_id = store.create_conversation(page_url="https://example.com/a", title="A")
    assert store.exists(conversation_id) is True
    assert store.exists("nonexistent") is False


def test_append_and_get_messages_preserves_order(store):
    conversation_id = store.create_conversation(page_url="https://example.com/a", title=None)
    store.append_message(conversation_id, ChatMessage(role="user", content="hi"))
    store.append_message(conversation_id, ChatMessage(role="assistant", content="hello"))

    messages = store.get_messages(conversation_id)
    assert [(m.role, m.content) for m in messages] == [("user", "hi"), ("assistant", "hello")]


def test_list_by_page_url_most_recent_first(store):
    older = store.create_conversation(page_url="https://example.com/a", title="older")
    store.append_message(older, ChatMessage(role="user", content="first"))
    newer = store.create_conversation(page_url="https://example.com/a", title="newer")
    store.append_message(newer, ChatMessage(role="user", content="second"))

    results = store.list_by_page_url("https://example.com/a")
    assert [r.id for r in results] == [newer, older]


def test_list_by_page_url_scoped_to_url(store):
    a = store.create_conversation(page_url="https://example.com/a", title=None)
    store.create_conversation(page_url="https://example.com/b", title=None)

    results = store.list_by_page_url("https://example.com/a")
    assert [r.id for r in results] == [a]


def test_delete_removes_conversation(store):
    conversation_id = store.create_conversation(page_url="https://example.com/a", title=None)
    store.delete(conversation_id)
    assert store.exists(conversation_id) is False
