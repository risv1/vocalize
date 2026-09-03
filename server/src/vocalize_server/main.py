from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from vocalize_server.config import get_settings
from vocalize_server.routers import chat, conversations, crawl, health, providers, tts

settings = get_settings()

app = FastAPI(title="Vocalize Server", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(tts.router)
app.include_router(chat.router)
app.include_router(crawl.router)
app.include_router(providers.router)
app.include_router(conversations.router)
