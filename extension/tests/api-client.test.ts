import { describe, expect, it, vi } from "vitest";
import { ApiClient, parseSse } from "../src/lib/api-client";

function streamFromStrings(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) {
        controller.enqueue(encoder.encode(chunks[i++]));
      } else {
        controller.close();
      }
    },
  });
}

describe("parseSse", () => {
  it("yields tokens and stops at [DONE]", async () => {
    const stream = streamFromStrings(["data: hel", "lo\n\n", "data: world\n\n", "data: [DONE]\n\n"]);
    const tokens: string[] = [];
    for await (const token of parseSse(stream)) tokens.push(token);
    expect(tokens).toEqual(["hello", "world"]);
  });

  it("ignores non-data lines", async () => {
    const stream = streamFromStrings([": comment\n\ndata: hi\n\n", "data: [DONE]\n\n"]);
    const tokens: string[] = [];
    for await (const token of parseSse(stream)) tokens.push(token);
    expect(tokens).toEqual(["hi"]);
  });
});

describe("ApiClient", () => {
  it("checkHealth returns false on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const client = new ApiClient("http://localhost:8420");
    expect(await client.checkHealth()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("checkHealth returns true on 200", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true }));
    const client = new ApiClient("http://localhost:8420/");
    expect(await client.checkHealth()).toBe(true);
    vi.unstubAllGlobals();
  });
});
