import { ApiClient } from "../lib/api-client";
import { getSettings, updateSettings } from "../lib/storage";
import { applyAccentColor, applyTheme } from "../lib/theme";
import { ACCENT_PRESETS, type ThemePreference } from "../lib/types";

const serverUrlInput = document.getElementById("server-url") as HTMLInputElement;
const serverStatus = document.getElementById("server-status") as HTMLDivElement;
const themeSelect = document.getElementById("theme-select") as HTMLSelectElement;
const accentSwatches = document.getElementById("accent-swatches") as HTMLDivElement;
const voiceSelect = document.getElementById("voice-select") as HTMLSelectElement;
const speedRange = document.getElementById("speed-range") as HTMLInputElement;
const speedValue = document.getElementById("speed-value") as HTMLSpanElement;
const providersList = document.getElementById("providers-list") as HTMLDivElement;
const activeLlmName = document.getElementById("active-llm-name") as HTMLSpanElement;
const llmModelInput = document.getElementById("llm-model-input") as HTMLInputElement;
const llmModelHint = document.getElementById("llm-model-hint") as HTMLParagraphElement;
const speakToggle = document.getElementById("speak-toggle") as HTMLInputElement;
const crawlToggle = document.getElementById("crawl-toggle") as HTMLInputElement;
const savedIndicator = document.getElementById("saved-indicator") as HTMLDivElement;

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function flashSaved(): void {
  savedIndicator.hidden = false;
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => (savedIndicator.hidden = true), 1200);
}

async function refreshServerData(): Promise<void> {
  const settings = await getSettings();
  const client = new ApiClient(settings.serverUrl);

  const reachable = await client.checkHealth();
  serverStatus.textContent = reachable ? "Connected" : "Server unreachable";
  serverStatus.style.color = reachable ? "var(--success)" : "var(--error)";
  if (!reachable) return;

  try {
    const { voices, default_voice } = await client.listVoices();
    voiceSelect.innerHTML = "";
    for (const voice of voices) {
      const option = document.createElement("option");
      option.value = voice;
      option.textContent = voice;
      voiceSelect.appendChild(option);
    }
    voiceSelect.value = settings.voice || default_voice;
  } catch {
    voiceSelect.innerHTML = "";
  }

  try {
    const providers = await client.listProviders();
    providersList.innerHTML = "";
    const rows = [
      ...providers.llm.map((p) => ({ ...p, active: p.name === providers.active_llm })),
      ...providers.tts.map((p) => ({ ...p, active: p.name === providers.active_tts })),
    ];
    for (const row of rows) {
      const el = document.createElement("div");
      el.className = "provider-row";
      const label = `${row.kind.toUpperCase()} · ${row.name}${row.active ? " (active)" : ""}`;
      const status = row.configured
        ? `Configured${row.model ? ` · ${row.model}` : ""}`
        : "Not configured";
      el.innerHTML = `<span>${label}</span><span class="muted">${status}</span>`;
      providersList.appendChild(el);
    }

    const activeLlm = providers.llm.find((p) => p.name === providers.active_llm);
    activeLlmName.textContent = providers.active_llm;
    llmModelHint.textContent = activeLlm?.model
      ? `Server default: ${activeLlm.model}`
      : "No server default model configured for this provider.";
  } catch {
    providersList.innerHTML = '<div class="muted">Could not load providers.</div>';
  }
}

serverUrlInput.addEventListener("change", async () => {
  await updateSettings({ serverUrl: serverUrlInput.value.trim() });
  flashSaved();
  await refreshServerData();
});

themeSelect.addEventListener("change", async () => {
  const theme = themeSelect.value as ThemePreference;
  await updateSettings({ theme });
  applyTheme(theme);
  flashSaved();
});

function renderAccentSwatches(selected: string): void {
  accentSwatches.innerHTML = "";
  for (const preset of ACCENT_PRESETS) {
    const swatch = document.createElement("button");
    swatch.type = "button";
    swatch.className = "accent-swatch" + (preset.color === selected ? " selected" : "");
    swatch.style.background = preset.color;
    swatch.title = preset.name;
    swatch.setAttribute("aria-label", preset.name);
    swatch.addEventListener("click", async () => {
      await updateSettings({ accentColor: preset.color });
      applyAccentColor(preset.color);
      renderAccentSwatches(preset.color);
      flashSaved();
    });
    accentSwatches.appendChild(swatch);
  }
}

voiceSelect.addEventListener("change", async () => {
  await updateSettings({ voice: voiceSelect.value });
  flashSaved();
});

speedRange.addEventListener("input", () => {
  speedValue.textContent = Number(speedRange.value).toFixed(1);
});

speedRange.addEventListener("change", async () => {
  await updateSettings({ speed: Number(speedRange.value) });
  flashSaved();
});

llmModelInput.addEventListener("change", async () => {
  await updateSettings({ llmModel: llmModelInput.value.trim() });
  flashSaved();
});

speakToggle.addEventListener("change", async () => {
  await updateSettings({ speakChatResponses: speakToggle.checked });
  flashSaved();
});

crawlToggle.addEventListener("change", async () => {
  await updateSettings({ crawlEnabled: crawlToggle.checked });
  flashSaved();
});

async function init(): Promise<void> {
  const settings = await getSettings();
  applyTheme(settings.theme);
  applyAccentColor(settings.accentColor);
  renderAccentSwatches(settings.accentColor);
  serverUrlInput.value = settings.serverUrl;
  themeSelect.value = settings.theme;
  speedRange.value = String(settings.speed);
  speedValue.textContent = settings.speed.toFixed(1);
  llmModelInput.value = settings.llmModel;
  speakToggle.checked = settings.speakChatResponses;
  crawlToggle.checked = settings.crawlEnabled;
  await refreshServerData();
}

void init();
