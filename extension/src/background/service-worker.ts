import { getSettings } from "../lib/storage";

const OFFSCREEN_URL = "src/offscreen/offscreen.html";
const LOG = "[vocalize:bg]";
const LAST_FOCUSED_KEY = "lastFocusedNormalWindowId";

/**
 * Tracks the last-focused *normal* browser window (not our own pop-out
 * panel, which is type: "popup" — see popup.ts "popout-btn"). Without
 * this, tab-messaging.ts's "current window" queries have no reliable way
 * to tell which browsing window the user actually means once the panel
 * itself can hold OS focus: every normal window reports focused: false at
 * that point, and guessing (e.g. "the first one") can land on an unrelated
 * window — this is what caused the extension to read a Gmail tab instead
 * of the page the user meant. Stored in chrome.storage.session so it
 * survives this service worker being suspended and woken back up.
 */
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  if (windowId === chrome.windows.WINDOW_ID_NONE) return; // focus left the browser
  try {
    const win = await chrome.windows.get(windowId);
    if (win.type === "normal") {
      await chrome.storage.session.set({ [LAST_FOCUSED_KEY]: windowId });
    }
  } catch {
    // Window may have closed between the event firing and this lookup.
  }
});

async function ensureOffscreenDocument(): Promise<void> {
  const existing = await chrome.runtime.getContexts({
    contextTypes: [chrome.runtime.ContextType.OFFSCREEN_DOCUMENT],
  });
  if (existing.length > 0) {
    console.log(LOG, "offscreen document already exists");
    return;
  }
  console.log(LOG, "creating offscreen document");
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_URL,
    reasons: [chrome.offscreen.Reason.AUDIO_PLAYBACK],
    justification: "Play synthesized TTS audio; MV3 service workers have no AudioContext.",
  });
  console.log(LOG, "offscreen document created");
}

/**
 * Ensures the offscreen document exists and forwards an audio-* message to
 * it (fire-and-forget on the forward itself — see the long comment this
 * function used to carry, now consolidated here: waiting on the full
 * offscreen round trip risked the message port closing before a response
 * was ever sent, which showed up as "Couldn't start audio: unknown error").
 * Shared by both the popup's explicit audio-* messages and region-select
 * playback below, so region playback works even with no popup/panel open.
 */
async function dispatchToOffscreen(message: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
  try {
    await ensureOffscreenDocument();
  } catch (error) {
    console.error(LOG, "failed to create/verify offscreen document:", error);
    return { ok: false, error: String(error) };
  }
  console.log(LOG, "forwarding", message.type, "to offscreen document");
  chrome.runtime.sendMessage({ ...message, target: "offscreen" }).catch((error) => {
    console.error(LOG, "offscreen document did not accept forwarded message:", error);
  });
  return { ok: true };
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // chrome.runtime.sendMessage broadcasts to every extension context,
  // including the sender itself — so once we forward a message to the
  // offscreen document (tagged target: "offscreen" below), THIS listener
  // would otherwise receive that same forwarded copy again and re-forward
  // it forever. Ignore anything already tagged for the offscreen doc.
  if (message?.target === "offscreen") {
    return false;
  }

  if (message?.type === "vocalize:region-selected" && typeof message.text === "string") {
    // Speak the selected region directly — do NOT depend on the popup
    // being open. If the user is using the plain toolbar popup (not the
    // pop-out panel), it auto-closes the instant they click into the page
    // to select something, so a popup-only playback trigger would silently
    // do nothing. This is also still relayed to the popup (best-effort, if
    // one happens to be open) purely so its UI can update.
    console.log(LOG, "region selected:", message.text.length, "chars");
    chrome.runtime.sendMessage({ type: "vocalize:region-text", text: message.text }).catch(() => {
      // No popup open to relay to — fine, playback below doesn't need one.
    });
    getSettings()
      .then((settings) =>
        dispatchToOffscreen({
          type: "vocalize:audio-play",
          serverUrl: settings.serverUrl,
          text: message.text,
          voice: settings.voice,
          speed: settings.speed,
          pageUrl: message.pageUrl,
        })
      )
      .catch((error) => console.error(LOG, "failed to play selected region:", error));
    return false;
  }

  if (typeof message?.type === "string" && message.type.startsWith("vocalize:audio-")) {
    console.log(LOG, "received", message.type, "from popup");
    dispatchToOffscreen(message).then(sendResponse);
    return true;
  }

  return false;
});
