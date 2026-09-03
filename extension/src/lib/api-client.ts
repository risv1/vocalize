import type { ChatMessage, ConversationSummary, ProvidersResponse, VoicesResponse } from "./types";

function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path}`;
}

export class ApiClient {
  constructor(private readonly serverUrl: string) {}

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(joinUrl(this.serverUrl, "/api/health"), { method: "GET" });
      return res.ok;
    } catch {
      return false;
    }
  }

  async listVoices(): Promise<VoicesResponse> {
    const res = await fetch(joinUrl(this.serverUrl, "/api/voices"));
    if (!res.ok) throw new Error(`Failed to list voices: ${res.status}`);
    return res.json();
  }

  async listProviders(): Promise<ProvidersResponse> {
    const res = await fetch(joinUrl(this.serverUrl, "/api/providers"));
    if (!res.ok) throw new Error(`Failed to list providers: ${res.status}`);
    return res.json();
  }

  /** Streams length-prefixed WAV frames (see server tts/base.py frame_audio_chunk). */
  async streamTts(text: string, voice: string, speed: number): Promise<ReadableStream<Uint8Array>> {
    const res = await fetch(joinUrl(this.serverUrl, "/api/tts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, speed }),
    });
    if (!res.ok || !res.body) throw new Error(`TTS request failed: ${res.status}`);
    return res.body;
  }

  /** Streams SSE "data: <token>\n\n" chunks, terminated by "data: [DONE]\n\n". */
  async *streamChat(
    messages: ChatMessage[],
    pageContext?: string,
    model?: string,
    conversationId?: string | null
  ): AsyncGenerator<string> {
    const res = await fetch(joinUrl(this.serverUrl, "/api/chat"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages,
        page_context: pageContext,
        model: model || undefined,
        conversation_id: conversationId || undefined,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Chat request failed: ${res.status}`);
    yield* parseSse(res.body);
  }

  async *streamInsights(
    pageText: string,
    pageTitle: string,
    extraContext?: string,
    model?: string
  ): AsyncGenerator<string> {
    const res = await fetch(joinUrl(this.serverUrl, "/api/insights"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        page_text: pageText,
        page_title: pageTitle,
        extra_context: extraContext,
        model: model || undefined,
      }),
    });
    if (!res.ok || !res.body) throw new Error(`Insights request failed: ${res.status}`);
    yield* parseSse(res.body);
  }

  /** Finds the most recently updated conversation for a page, if any. */
  async findConversationForPage(pageUrl: string): Promise<ConversationSummary | null> {
    const res = await fetch(
      joinUrl(this.serverUrl, `/api/conversations?page_url=${encodeURIComponent(pageUrl)}&limit=1`)
    );
    if (!res.ok) throw new Error(`Failed to list conversations: ${res.status}`);
    const data: { conversations: ConversationSummary[] } = await res.json();
    return data.conversations[0] ?? null;
  }

  async createConversation(pageUrl: string, title?: string): Promise<string> {
    const res = await fetch(joinUrl(this.serverUrl, "/api/conversations"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page_url: pageUrl, title }),
    });
    if (!res.ok) throw new Error(`Failed to create conversation: ${res.status}`);
    const data: { id: string } = await res.json();
    return data.id;
  }

  async getConversationMessages(conversationId: string): Promise<ChatMessage[]> {
    const res = await fetch(joinUrl(this.serverUrl, `/api/conversations/${conversationId}`));
    if (!res.ok) throw new Error(`Failed to load conversation: ${res.status}`);
    const data: { messages: ChatMessage[] } = await res.json();
    return data.messages;
  }
}

export async function* parseSse(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";
    for (const event of events) {
      const line = event.trim();
      if (!line.startsWith("data: ")) continue;
      const data = line.slice("data: ".length);
      if (data === "[DONE]") return;
      yield data;
    }
  }
}
