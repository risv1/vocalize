import { DEFAULT_SETTINGS, type VocalizeSettings } from "./types";

const STORAGE_KEY = "vocalizeSettings";

// chrome.storage.local (not .sync): settings like the server URL are
// machine-specific and shouldn't sync across Chrome installs, and .sync
// requires the browser to be signed into a Google account with sync on —
// .local always works and persists indefinitely on this machine.

export async function getSettings(): Promise<VocalizeSettings> {
  const stored = await chrome.storage.local.get(STORAGE_KEY);
  return { ...DEFAULT_SETTINGS, ...(stored[STORAGE_KEY] ?? {}) };
}

export async function updateSettings(patch: Partial<VocalizeSettings>): Promise<VocalizeSettings> {
  const current = await getSettings();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [STORAGE_KEY]: next });
  return next;
}

export function onSettingsChanged(callback: (settings: VocalizeSettings) => void): () => void {
  const listener = (changes: { [key: string]: chrome.storage.StorageChange }, area: string) => {
    if (area !== "local" || !changes[STORAGE_KEY]) return;
    callback({ ...DEFAULT_SETTINGS, ...changes[STORAGE_KEY].newValue });
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
