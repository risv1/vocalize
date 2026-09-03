from collections.abc import AsyncIterator

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from vocalize_server.config import get_settings
from vocalize_server.llm.base import LLMProvider
from vocalize_server.llm.router import get_llm_provider
from vocalize_server.routers.conversations import get_conversation_store
from vocalize_server.schemas import ChatMessage, ChatRequest, InsightRequest

router = APIRouter()

INSIGHT_SYSTEM_PROMPT = (
    "You are a concise reading assistant embedded in a browser extension. "
    "Given the main content of a web page, produce a short (3-5 sentence) "
    "explanation of what the page is about and why it might matter to the "
    "reader. Do not repeat the text verbatim; synthesize it."
)

CHAT_SYSTEM_PROMPT = (
    "You are a helpful assistant answering questions about the web page the "
    "user is currently reading. Use the provided page context when relevant. "
    "Keep answers concise and conversational, since they may be read aloud."
)


async def _require_ready(provider: LLMProvider, provider_name: str) -> None:
    if not provider.is_configured():
        raise HTTPException(
            503,
            detail=f"LLM provider '{provider_name}' is not configured — "
            "set the required API key/model in server/.env and restart the server.",
        )
    error = await provider.health_check()
    if error:
        raise HTTPException(503, detail=error)


def _sse(token: str) -> str:
    return f"data: {token}\n\n"


async def _stream_and_persist(
    provider: LLMProvider,
    messages: list[ChatMessage],
    model: str | None,
    conversation_id: str | None,
) -> AsyncIterator[str]:
    full_reply = ""
    async for token in provider.stream_chat(messages, model):
        full_reply += token
        yield _sse(token)
    yield "data: [DONE]\n\n"

    if conversation_id and messages:
        store = get_conversation_store()
        store.append_message(conversation_id, messages[-1])
        if full_reply:
            store.append_message(conversation_id, ChatMessage(role="assistant", content=full_reply))


@router.post("/api/chat")
async def chat(request: ChatRequest):
    settings = get_settings()
    provider = get_llm_provider()
    await _require_ready(provider, settings.llm_provider)

    messages = list(request.messages)
    if request.conversation_id:
        store = get_conversation_store()
        history = store.get_messages(request.conversation_id)
        new_turn = messages[-1] if messages else None
        messages = history + ([new_turn] if new_turn else [])

    if request.page_context:
        system_content = f"{CHAT_SYSTEM_PROMPT}\n\nPage context:\n{request.page_context}"
        messages = [ChatMessage(role="system", content=system_content)] + messages

    return StreamingResponse(
        _stream_and_persist(provider, messages, request.model, request.conversation_id),
        media_type="text/event-stream",
    )


@router.post("/api/insights")
async def insights(request: InsightRequest):
    settings = get_settings()
    provider = get_llm_provider()
    await _require_ready(provider, settings.llm_provider)

    context = request.page_text
    if request.extra_context:
        context = f"{context}\n\nAdditional related-page context:\n{request.extra_context}"
    messages = [
        ChatMessage(role="system", content=INSIGHT_SYSTEM_PROMPT),
        ChatMessage(
            role="user",
            content=f"Page title: {request.page_title or 'Untitled'}\n\n{context}",
        ),
    ]

    async def generate() -> AsyncIterator[str]:
        async for token in provider.stream_chat(messages, request.model):
            yield _sse(token)
        yield "data: [DONE]\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
