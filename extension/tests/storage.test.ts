import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../src/lib/types";

function mockChromeStorage() {
  const store: Record<string, unknown> = {};
  return {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: store[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(store, items);
      }),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  };
}

describe("storage", () => {
  beforeEach(() => {
    vi.resetModules();
    (globalThis as unknown as { chrome: unknown }).chrome = { storage: mockChromeStorage() };
  });

  it("returns defaults when nothing is stored", async () => {
    const { getSettings } = await import("../src/lib/storage");
    const settings = await getSettings();
    expect(settings).toEqual(DEFAULT_SETTINGS);
  });

  it("merges a partial update onto existing settings", async () => {
    const { getSettings, updateSettings } = await import("../src/lib/storage");
    await updateSettings({ voice: "am_adam", speed: 1.5 });
    const settings = await getSettings();
    expect(settings.voice).toBe("am_adam");
    expect(settings.speed).toBe(1.5);
    expect(settings.serverUrl).toBe(DEFAULT_SETTINGS.serverUrl);
  });
});
