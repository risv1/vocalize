import { ApiClient } from "../lib/api-client";
import { OrbCanvas } from "../lib/orb-canvas";
import { getSettings, onSettingsChanged, updateSettings } from "../lib/storage";
import { getActiveTabUrl, sendToActiveTab } from "../lib/tab-messaging";
import { applyAccentColor, applyTheme } from "../lib/theme";
import type { ChatMessage, ExtractedContent, PlaybackState } from "../lib/types";

const orbCanvas = document.getElementById("orb") as HTMLCanvasElement;
const statusLine = document.getElementById("status-line") as HTMLDivElement;
const optionsBtn = document.getElementById("options-btn") as HTMLButtonElement;
const popoutBtn = document.getElementById("popout-btn") as HTMLButtonElement;
const serverWarning = document.getElementById("server-warning") as HTMLDivElement;
const serverForm = document.getElementById("server-form") as HTMLFormElement;
const serverUrlInline = document.getElementById("server-url-inline") as HTMLInputElement;
const readPageBtn = document.getElementById("read-page-btn") as HTMLButtonElement;
const selectRegionBtn = document.getElementById("select-region-btn") as HTMLButtonElement;
const pauseBtn = document.getElementById("pause-btn") as HTMLButtonElement;
const resumeBtn = document.getElementById("resume-btn") as HTMLButtonElement;
const back10Btn = document.getElementById("back10-btn") as HTMLButtonElement;
const back5Btn = document.getElementById("back5-btn") as HTMLButtonElement;
const restartBtn = document.getElementById("restart-btn") as HTMLButtonElement;
const stopBtn = document.getElementById("stop-btn") as HTMLButtonElement;
const seekSlider = document.getElementById("seek-slider") as HTMLInputElement;
const seekCurrent = document.getElementById("seek-current") as HTMLSpanElement;
const seekTotal = document.getElementById("seek-total") as HTMLSpanElement;
const voiceSelect = document.getElementById("voice-select") as HTMLSelectElement;
const speakToggle = document.getElementById("speak-toggle") as HTMLInputElement;
const insightsText = document.getElementById("insights-text") as HTMLDivElement;
const chatLog = document.getElementById("chat-log") as HTMLDivElement;
const chatForm = document.getElementById("chat-form") as HTMLFormElement;
const chatInput = document.getElementById("chat-input") as HTMLInputElement;

const orb = new OrbCanvas(orbCanvas);
let playbackState: PlaybackState = "idle";
let lastExtraction: ExtractedContent | null = null;
let regionSelecting = false;
let conversationId: string | null = null;
let isDraggingSlider = false;

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function setStatus(text: string): void {
  statusLine.textContent = text;
}

function setPlaybackState(state: PlaybackState): void {
  playbackState = state;
  orb.setState(state);
  setStatus(
    { idle: "Idle", loading: "Loading…", playing: "Reading…", paused: "Paused" }[state]
  );
}

async function getApiClient(): Promise<ApiClient> {
  const settings = await getSettings();
  return new ApiClient(settings.serverUrl);
}

async function checkServerReachable(): Promise<void> {
  const settings = await getSettings();
  const client = new ApiClient(settings.serverUrl);
  const ok = await client.checkHealth();
  serverWarning.hidden = ok;
  if (!ok) serverUrlInline.value = settings.serverUrl;
}

async function populateVoices(): Promise<void> {
  try {
    const client = await getApiClient();
    const { voices, default_voice } = await client.listVoices();
    const settings = await getSettings();
    voiceSelect.innerHTML = "";
    for (const voice of voices) {
      const option = document.createElement("option");
      option.value = voice;
      option.textContent = voice;
      voiceSelect.appendChild(option);
    }
    voiceSelect.value = settings.voice || default_voice;
    // This succeeding proves the server is reachable even if the earlier
    // checkServerReachable() call raced a cold start and failed transiently.
    serverWarning.hidden = true;
  } catch {
    voiceSelect.innerHTML = '<option value="">(server unreachable)</option>';
  }
}

function extractFromActiveTab(): Promise<ExtractedContent | null> {
  return sendToActiveTab<ExtractedContent>({ type: "vocalize:extract" });
}

async function playText(text: string, pageUrl?: string): Promise<void> {
  const settings = await getSettings();
  console.log(`[vocalize:popup] playText: ${text.length} chars, voice=${settings.voice}, server=${settings.serverUrl}`);
  try {
    const response = await chrome.runtime.sendMessage<unknown, { ok: boolean; error?: string }>({
      type: "vocalize:audio-play",
      serverUrl: settings.serverUrl,
      text,
      voice: settings.voice,
      speed: settings.speed,
      pageUrl,
    });
    console.log("[vocalize:popup] audio-play response from background:", response);
    if (!response?.ok) {
      setStatus(
        `Couldn't start audio: ${response?.error ?? "no response from background script — check its console (chrome://extensions -> Vocalize -> service worker)"}`
      );
    }
  } catch (error) {
    console.error("[vocalize:popup] sendMessage(audio-play) rejected:", error);
    setStatus(`Couldn't start audio: ${String(error)}`);
  }
}

async function fetchInsights(content: ExtractedContent, speak: boolean): Promise<void> {
  insightsText.textContent = "";
  insightsText.classList.remove("muted");
  const client = await getApiClient();
  const settings = await getSettings();
  let fullText = "";
  if (!speak) orb.setState("loading");
  try {
    for await (const token of client.streamInsights(
      content.text,
      content.title,
      undefined,
      settings.llmModel
    )) {
      fullText += token;
      insightsText.textContent = fullText;
    }
  } catch {
    insightsText.textContent = "Could not reach the server for insights.";
    if (!speak) orb.setState(playbackState);
    return;
  }
  if (speak && settings.speakChatResponses && fullText.trim()) {
    await playText(fullText);
  } else if (!speak) {
    orb.setState(playbackState);
  }
}

readPageBtn.addEventListener("click", async () => {
  setStatus("Extracting page…");
  const content = await extractFromActiveTab();
  if (!content || !content.text) {
    setStatus("Couldn't extract content from this page.");
    return;
  }
  lastExtraction = content;
  // Narrate the actual page text; the insight is generated for the text
  // panel only here (speak: false) — auto-speaking it right after used to
  // immediately cut off and replace the page narration, since a new
  // audio-play request always resets the player. Insights still speak
  // normally when produced from an explicit chat question.
  await playText(content.text, content.url);
  void fetchInsights(content, false);
});

selectRegionBtn.addEventListener("click", async () => {
  regionSelecting = !regionSelecting;
  selectRegionBtn.textContent = regionSelecting ? "Selecting… (click page)" : "Select region";
  const response = await sendToActiveTab<{ ok: boolean }>({
    type: regionSelecting ? "vocalize:start-region-select" : "vocalize:stop-region-select",
  });
  if (!response) {
    regionSelecting = false;
    selectRegionBtn.textContent = "Select region";
    setStatus("Couldn't start region select on this page.");
  }
});

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "vocalize:region-text" && message.text) {
    // Playback itself is triggered directly by the background script (see
    // service-worker.ts) so it works even if this popup isn't open — this
    // handler only updates the UI for when it happens to be.
    regionSelecting = false;
    selectRegionBtn.textContent = "Select region";
    lastExtraction = { title: document.title, text: message.text, isSelection: true, url: "" };
  }
  if (message?.type === "vocalize:playback-state") {
    console.log("[vocalize:popup] playback-state:", message);
    setPlaybackState(message.state as PlaybackState);
    updateSeekUi(message.currentTime, message.duration);
  }
  if (message?.type === "vocalize:playback-error") {
    console.error("[vocalize:popup] playback-error:", message.error);
    setStatus(`Error: ${message.error}`);
    setPlaybackState("idle");
  }
});

function updateSeekUi(current: number, duration: number): void {
  if (isDraggingSlider) return;
  const safeDuration = Number.isFinite(duration) ? duration : 0;
  const safeCurrent = Number.isFinite(current) ? current : 0;
  seekSlider.max = String(safeDuration);
  seekSlider.value = String(safeCurrent);
  const pct = safeDuration > 0 ? (safeCurrent / safeDuration) * 100 : 0;
  seekSlider.style.setProperty("--seek-pct", String(pct));
  seekCurrent.textContent = formatTime(safeCurrent);
  seekTotal.textContent = formatTime(safeDuration);
}

pauseBtn.addEventListener("click", () => chrome.runtime.sendMessage({ type: "vocalize:audio-pause" }));
resumeBtn.addEventListener("click", () => chrome.runtime.sendMessage({ type: "vocalize:audio-resume" }));
restartBtn.addEventListener("click", () => chrome.runtime.sendMessage({ type: "vocalize:audio-restart" }));
stopBtn.addEventListener("click", () => chrome.runtime.sendMessage({ type: "vocalize:audio-stop" }));
back10Btn.addEventListener("click", () =>
  chrome.runtime.sendMessage({ type: "vocalize:audio-seek-relative", deltaSeconds: -10 })
);
back5Btn.addEventListener("click", () =>
  chrome.runtime.sendMessage({ type: "vocalize:audio-seek-relative", deltaSeconds: -5 })
);

seekSlider.addEventListener("pointerdown", () => {
  isDraggingSlider = true;
});

seekSlider.addEventListener("input", () => {
  const value = Number(seekSlider.value);
  const max = Number(seekSlider.max) || 0;
  const pct = max > 0 ? (value / max) * 100 : 0;
  seekSlider.style.setProperty("--seek-pct", String(pct));
  seekCurrent.textContent = formatTime(value);
});

seekSlider.addEventListener("change", () => {
  chrome.runtime.sendMessage({ type: "vocalize:audio-seek", toSeconds: Number(seekSlider.value) });
  isDraggingSlider = false;
});

voiceSelect.addEventListener("change", () => {
  void updateSettings({ voice: voiceSelect.value });
});

speakToggle.addEventListener("change", () => {
  void updateSettings({ speakChatResponses: speakToggle.checked });
});

serverForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const url = serverUrlInline.value.trim();
  if (!url) return;
  setStatus("Saving server URL…");
  await updateSettings({ serverUrl: url });
  await checkServerReachable();
  await populateVoices();
  setStatus(serverWarning.hidden ? "Connected" : "Still unreachable — check the URL");
});

optionsBtn.addEventListener("click", () => chrome.runtime.openOptionsPage());

const isPanelWindow = new URLSearchParams(location.search).get("panel") === "1";

popoutBtn.addEventListener("click", () => {
  chrome.windows.create({
    url: chrome.runtime.getURL("src/popup/popup.html?panel=1"),
    type: "popup",
    width: 420,
    height: 720,
    focused: true,
  });
});

function appendChatMessage(role: "user" | "assistant", text: string): HTMLDivElement {
  const el = document.createElement("div");
  el.className = `chat-message ${role}`;
  el.textContent = text;
  chatLog.appendChild(el);
  chatLog.scrollTop = chatLog.scrollHeight;
  return el;
}

const chatHistory: ChatMessage[] = [];

function renderChatHistory(messages: ChatMessage[]): void {
  chatLog.innerHTML = "";
  chatHistory.length = 0;
  for (const message of messages) {
    if (message.role === "system") continue;
    chatHistory.push(message);
    appendChatMessage(message.role === "user" ? "user" : "assistant", message.content);
  }
}

/** Resumes the persisted conversation for the current tab's page, or starts
 * a new one, so closing/reopening the popup doesn't lose the chat. */
async function resumeConversationForActiveTab(): Promise<void> {
  const tab = await getActiveTabUrl();
  if (!tab?.url) return;

  const client = await getApiClient();
  try {
    const existing = await client.findConversationForPage(tab.url);
    if (existing) {
      conversationId = existing.id;
      const messages = await client.getConversationMessages(existing.id);
      renderChatHistory(messages);
    } else {
      conversationId = await client.createConversation(tab.url, tab.title);
    }
  } catch {
    // Server unreachable — chat still works for this session, it just won't persist.
    conversationId = null;
  }
}

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = chatInput.value.trim();
  if (!question) return;
  chatInput.value = "";
  appendChatMessage("user", question);
  const userMessage: ChatMessage = { role: "user", content: question };
  chatHistory.push(userMessage);

  const assistantEl = appendChatMessage("assistant", "");
  const client = await getApiClient();
  const settings = await getSettings();
  const pageContext = lastExtraction?.text?.slice(0, 6000);
  // With a persisted conversation the server already has prior turns —
  // only send the new one. Otherwise send the full local history.
  const messagesToSend = conversationId ? [userMessage] : chatHistory;

  orb.setState("loading");
  let fullText = "";
  try {
    for await (const token of client.streamChat(
      messagesToSend,
      pageContext,
      settings.llmModel,
      conversationId
    )) {
      fullText += token;
      assistantEl.textContent = fullText;
      chatLog.scrollTop = chatLog.scrollHeight;
    }
  } catch {
    fullText = "Sorry, I couldn't reach the server.";
    assistantEl.textContent = fullText;
  }
  chatHistory.push({ role: "assistant", content: fullText });

  if (settings.speakChatResponses && fullText.trim()) {
    await playText(fullText);
  } else {
    orb.setState(playbackState);
  }
});

async function init(): Promise<void> {
  if (isPanelWindow) {
    document.body.classList.add("panel-mode");
    popoutBtn.hidden = true;
  }
  const settings = await getSettings();
  applyTheme(settings.theme);
  applyAccentColor(settings.accentColor);
  orb.setAccentColor(settings.accentColor);
  speakToggle.checked = settings.speakChatResponses;
  onSettingsChanged((next) => {
    applyTheme(next.theme);
    applyAccentColor(next.accentColor);
    orb.setAccentColor(next.accentColor);
  });
  await checkServerReachable();
  await populateVoices();
  await resumeConversationForActiveTab();
  setPlaybackState("idle");
}

void init();
