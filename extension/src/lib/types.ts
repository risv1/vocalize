export type ThemePreference = "system" | "light" | "dark";

export interface VocalizeSettings {
  serverUrl: string;
  voice: string;
  speed: number;
  speakChatResponses: boolean;
  crawlEnabled: boolean;
  theme: ThemePreference;
  /** Overrides the server's configured default model for the active LLM
   * provider (e.g. an Ollama tag like "llama3.2"). Empty = use server default. */
  llmModel: string;
  /** Accent hex color; active/glow shades are derived from it via color-mix(). */
  accentColor: string;
}

export const ACCENT_PRESETS: { name: string; color: string }[] = [
  { name: "Orange", color: "#f54e00" },
  { name: "Blue", color: "#3b82f6" },
  { name: "Purple", color: "#a855f7" },
  { name: "Green", color: "#22c55e" },
  { name: "Pink", color: "#ec4899" },
  { name: "Teal", color: "#14b8a6" },
];

export const DEFAULT_SETTINGS: VocalizeSettings = {
  serverUrl: "http://127.0.0.1:8420",
  voice: "af_heart",
  speed: 1.0,
  speakChatResponses: true,
  crawlEnabled: false,
  theme: "system",
  llmModel: "",
  accentColor: ACCENT_PRESETS[0].color,
};

export type PlaybackState = "idle" | "loading" | "playing" | "paused";

export interface ExtractedContent {
  title: string;
  text: string;
  isSelection: boolean;
  url: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderInfo {
  name: string;
  kind: "tts" | "llm";
  configured: boolean;
  model: string | null;
}

export interface ProvidersResponse {
  tts: ProviderInfo[];
  llm: ProviderInfo[];
  active_tts: string;
  active_llm: string;
}

export interface VoicesResponse {
  provider: string;
  voices: string[];
  default_voice: string;
}

export interface ConversationSummary {
  id: string;
  page_url: string | null;
  title: string | null;
  updated_at: string;
}
