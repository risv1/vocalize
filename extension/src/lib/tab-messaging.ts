/**
 * Content scripts declared statically in the manifest only auto-inject on
 * page load — a tab that was already open when the extension was installed
 * or reloaded has no receiving end, so a plain sendMessage fails with
 * "Could not establish connection." This retries once after injecting the
 * script on demand via the `scripting` permission.
 */

function sendMessageToTab<T>(tabId: number, message: unknown): Promise<T | null> {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, (response: T | undefined) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response ?? null);
    });
  });
}

async function injectContentScript(tabId: number): Promise<boolean> {
  const files = chrome.runtime.getManifest().content_scripts?.[0]?.js;
  if (!files || files.length === 0) return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files });
    return true;
  } catch {
    // Restricted page (chrome://, the Web Store, etc.) — nothing we can do.
    return false;
  }
}

const LAST_FOCUSED_KEY = "lastFocusedNormalWindowId";

/**
 * Finds the active tab in a real browsing window — not `currentWindow`,
 * which (when this code runs in the extension's own pop-out panel window,
 * see popup.ts "popout-btn") would mean the panel window itself, which has
 * no tabs. Restricting to windowTypes "normal" excludes that panel (created
 * with type: "popup") and any devtools/app windows.
 *
 * Once the panel holds OS focus, every normal browser window reports
 * focused: false, so "pick the focused one" has nothing to go on — falling
 * back to an arbitrary window (e.g. windows[0]) can land on a completely
 * unrelated tab (this is what caused reading a Gmail tab instead of the
 * intended page). Instead prefer the window service-worker.ts's
 * onFocusChanged listener last recorded as focused, which keeps working
 * correctly even while the panel itself is focused.
 */
async function getTargetTab(): Promise<chrome.tabs.Tab | null> {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ["normal"] });
  if (windows.length === 0) return null;

  const { [LAST_FOCUSED_KEY]: lastFocusedId } = await chrome.storage.session.get(LAST_FOCUSED_KEY);
  const tracked = windows.find((w) => w.id === lastFocusedId);
  const target = tracked ?? windows.find((w) => w.focused) ?? windows[0];
  return target.tabs?.find((t) => t.active) ?? null;
}

export async function getActiveTabId(): Promise<number | null> {
  const tab = await getTargetTab();
  return tab?.id ?? null;
}

export async function getActiveTabUrl(): Promise<{ id: number; url: string; title?: string } | null> {
  const tab = await getTargetTab();
  if (!tab?.id || !tab.url) return null;
  return { id: tab.id, url: tab.url, title: tab.title };
}

export async function sendToActiveTab<T>(message: unknown): Promise<T | null> {
  const tabId = await getActiveTabId();
  if (tabId === null) return null;

  const first = await sendMessageToTab<T>(tabId, message);
  if (first !== null) return first;

  const injected = await injectContentScript(tabId);
  if (!injected) return null;
  return sendMessageToTab<T>(tabId, message);
}
