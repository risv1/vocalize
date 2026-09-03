from functools import lru_cache

from fastapi import APIRouter, HTTPException

from vocalize_server.config import get_settings
from vocalize_server.schemas import (
    ConversationCreateRequest,
    ConversationCreateResponse,
    ConversationListResponse,
    ConversationMessagesResponse,
)
from vocalize_server.storage.conversations import ConversationStore

router = APIRouter()


@lru_cache
def get_conversation_store() -> ConversationStore:
    settings = get_settings()
    return ConversationStore(db_path=f"{settings.data_dir}/conversations.db")


@router.post("/api/conversations", response_model=ConversationCreateResponse)
async def create_conversation(request: ConversationCreateRequest):
    store = get_conversation_store()
    conversation_id = store.create_conversation(page_url=request.page_url, title=request.title)
    return ConversationCreateResponse(id=conversation_id)


@router.get("/api/conversations", response_model=ConversationListResponse)
async def list_conversations(page_url: str, limit: int = 20):
    store = get_conversation_store()
    return ConversationListResponse(conversations=store.list_by_page_url(page_url, limit=limit))


@router.get("/api/conversations/{conversation_id}", response_model=ConversationMessagesResponse)
async def get_conversation(conversation_id: str):
    store = get_conversation_store()
    if not store.exists(conversation_id):
        raise HTTPException(404, detail="Conversation not found")
    return ConversationMessagesResponse(
        id=conversation_id, messages=store.get_messages(conversation_id)
    )


@router.delete("/api/conversations/{conversation_id}")
async def delete_conversation(conversation_id: str):
    store = get_conversation_store()
    store.delete(conversation_id)
    return {"ok": True}
