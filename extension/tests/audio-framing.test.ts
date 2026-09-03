import { describe, expect, it } from "vitest";
import { FrameDecoder } from "../src/lib/audio-framing";

function frame(bytes: Uint8Array): Uint8Array {
  const framed = new Uint8Array(4 + bytes.length);
  const view = new DataView(framed.buffer);
  view.setUint32(0, bytes.length, false);
  framed.set(bytes, 4);
  return framed;
}

describe("FrameDecoder", () => {
  it("decodes a single complete frame", () => {
    const decoder = new FrameDecoder();
    const payload = new Uint8Array([1, 2, 3, 4, 5]);
    const frames = decoder.push(frame(payload));
    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0])).toEqual(Array.from(payload));
  });

  it("buffers a partial frame until the rest arrives", () => {
    const decoder = new FrameDecoder();
    const payload = new Uint8Array([9, 8, 7, 6]);
    const framed = frame(payload);

    const firstHalf = framed.slice(0, 3);
    const secondHalf = framed.slice(3);

    expect(decoder.push(firstHalf)).toHaveLength(0);
    const frames = decoder.push(secondHalf);
    expect(frames).toHaveLength(1);
    expect(Array.from(frames[0])).toEqual(Array.from(payload));
  });

  it("decodes multiple frames delivered in one chunk", () => {
    const decoder = new FrameDecoder();
    const a = new Uint8Array([1, 1]);
    const b = new Uint8Array([2, 2, 2]);
    const combined = new Uint8Array([...frame(a), ...frame(b)]);

    const frames = decoder.push(combined);
    expect(frames).toHaveLength(2);
    expect(Array.from(frames[0])).toEqual(Array.from(a));
    expect(Array.from(frames[1])).toEqual(Array.from(b));
  });

  it("handles an empty payload frame", () => {
    const decoder = new FrameDecoder();
    const frames = decoder.push(frame(new Uint8Array([])));
    expect(frames).toHaveLength(1);
    expect(frames[0]).toHaveLength(0);
  });
});
