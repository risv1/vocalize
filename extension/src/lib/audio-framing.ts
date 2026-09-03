/**
 * Splits a stream of bytes framed as [4-byte big-endian length][wav bytes]...
 * (see server tts/base.py frame_audio_chunk) back into individual WAV clips.
 */
export class FrameDecoder {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): Uint8Array[] {
    const merged = new Uint8Array(this.buffer.length + chunk.length);
    merged.set(this.buffer, 0);
    merged.set(chunk, this.buffer.length);
    this.buffer = merged;

    const frames: Uint8Array[] = [];
    while (this.buffer.length >= 4) {
      const view = new DataView(this.buffer.buffer, this.buffer.byteOffset, 4);
      const length = view.getUint32(0, false);
      if (this.buffer.length < 4 + length) break;
      frames.push(this.buffer.slice(4, 4 + length));
      this.buffer = this.buffer.slice(4 + length);
    }
    return frames;
  }
}
