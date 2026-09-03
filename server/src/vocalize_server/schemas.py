from pydantic import BaseModel, Field


class TTSRequest(BaseModel):
    text: str
    voice: str | None = None
    speed: float | None = None
    # When set, the response is cached server-side keyed on (page_url, a
    # hash of text, voice, speed, provider, model) so re-narrating the same
    # page with the same voice/model replays instantly. Omit for ad hoc
    # text (chat replies, insights) that isn't worth caching.
    page_url: str | None = None


class ChatMessage(BaseModel):
    role: str  # "system" | "user" | "assistant"
    content: str


class ChatRequest(BaseModel):
    messages: list[ChatMessage]
    page_context: str | None = None
    model: str | None = None
    conversation_id: str | None = None


class InsightRequest(BaseModel):
    page_text: str
    page_title: str | None = None
    extra_context: str | None = None
    model: str | None = None


class ConversationCreateRequest(BaseModel):
    page_url: str | None = None
    title: str | None = None


class ConversationSummary(BaseModel):
    id: str
    page_url: str | None
    title: str | None
    updated_at: str


class ConversationCreateResponse(BaseModel):
    id: str


class ConversationMessagesResponse(BaseModel):
    id: str
    messages: list[ChatMessage]


class ConversationListResponse(BaseModel):
    conversations: list[ConversationSummary]


class CrawlRequest(BaseModel):
    url: str
    depth: int = Field(default=1, ge=0, le=3)
    same_domain: bool = True
    max_pages: int | None = None


class CrawlResult(BaseModel):
    url: str
    title: str | None
    text: str


class CrawlResponse(BaseModel):
    pages: list[CrawlResult]
    skipped: list[str] = []


class ProviderInfo(BaseModel):
    name: str
    kind: str  # "tts" | "llm"
    configured: bool
    model: str | None = None


class ProvidersResponse(BaseModel):
    tts: list[ProviderInfo]
    llm: list[ProviderInfo]
    active_tts: str
    active_llm: str


class VoicesResponse(BaseModel):
    provider: str
    voices: list[str]
    default_voice: str
