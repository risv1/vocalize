import { FrameDecoder } from "../lib/audio-framing";
import type { PlaybackState } from "../lib/types";

const LOG = "[vocalize:offscreen]";
console.log(LOG, "offscreen document script loaded");

// A plain <audio> element, not a raw AudioContext/AudioBufferSourceNode
// graph: Chrome can (and did, in testing — the offscreen document kept
// getting silently torn down and recreated mid-session) decide no "real"
// audio is playing through a Web Audio graph and reclaim the offscreen
// document. <audio> is what Chrome's own offscreen-audio sample uses for
// exactly this reason.
const audioEl = document.getElementById("player") as HTMLAudioElement;

interface Clip {
  url: string;
  duration: number;
}

let clips: Clip[] = [];
let currentIndex = 0;
let state: PlaybackState = "idle";
let sessionId = 0;
let streamDone = false;
let waitingForNextClip = false;

function offsetForIndex(index: number): number {
  let sum = 0;
  for (let i = 0; i < index && i < clips.length; i++) sum += clips[i].duration;
  return sum;
}

function totalDuration(): number {
  return clips.reduce((sum, c) => sum + c.duration, 0);
}

function currentTime(): number {
  return offsetForIndex(currentIndex) + (Number.isFinite(audioEl.currentTime) ? audioEl.currentTime : 0);
}

function reportState(): void {
  const payload = {
    type: "vocalize:playback-state",
    state,
    index: currentIndex,
    total: clips.length,
    currentTime: currentTime(),
    duration: totalDuration(),
    streamDone,
  };
  chrome.runtime.sendMessage(payload);
}

/** Loads metadata (chiefly .duration) for a clip without playing it, so the
 * timeline slider has real durations to work with as soon as clips arrive
 * rather than only once each one is actually played. */
function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const probe = new Audio();
    probe.preload = "metadata";
    probe.src = url;
    probe.addEventListener("loadedmetadata", () => resolve(probe.duration || 0), { once: true });
    probe.addEventListener("error", () => resolve(0), { once: true });
  });
}

function revokeClips(): void {
  for (const clip of clips) URL.revokeObjectURL(clip.url);
  clips = [];
}

function playFrom(index: number, withinClipSeconds = 0): void {
  if (index >= clips.length) return;
  const changingClip = index !== currentIndex || audioEl.src !== clips[index].url;
  currentIndex = index;
  waitingForNextClip = false;

  const startPlayback = () => {
    if (withinClipSeconds > 0) audioEl.currentTime = withinClipSeconds;
    audioEl.play().catch((error) => {
      console.error(LOG, `audio.play() failed for clip ${index + 1}:`, error);
      chrome.runtime.sendMessage({ type: "vocalize:playback-error", error: String(error) });
    });
  };

  if (changingClip) {
    audioEl.src = clips[index].url;
    if (withinClipSeconds > 0) {
      audioEl.addEventListener("loadedmetadata", startPlayback, { once: true });
    } else {
      startPlayback();
    }
  } else {
    startPlayback();
  }

  state = "playing";
  reportState();
}

/** Seeks to an absolute position (seconds) across the whole concatenated
 * timeline, crossing clip boundaries as needed — used by both the slider
 * and the -5s/-10s skip-back buttons. */
function seekTo(targetSeconds: number): void {
  if (clips.length === 0) return;
  const clamped = Math.max(0, Math.min(targetSeconds, totalDuration()));
  let acc = 0;
  for (let i = 0; i < clips.length; i++) {
    const d = clips[i].duration;
    const isLast = i === clips.length - 1;
    if (clamped < acc + d || isLast) {
      const withinClip = Math.max(0, clamped - acc);
      const wasPlaying = state === "playing" || state === "loading";
      playFrom(i, withinClip);
      if (!wasPlaying) pause();
      return;
    }
    acc += d;
  }
}

function seekBy(deltaSeconds: number): void {
  seekTo(currentTime() + deltaSeconds);
}

audioEl.addEventListener("timeupdate", () => {
  if (state === "playing") reportState();
});

audioEl.addEventListener("ended", () => {
  if (state !== "playing") return;
  const nextIndex = currentIndex + 1;
  if (nextIndex < clips.length) {
    playFrom(nextIndex);
  } else if (streamDone) {
    state = "idle";
    reportState();
  } else {
    // Played faster than the stream is producing clips — wait for the
    // next frame to land (see the push in loadAndPlay below).
    waitingForNextClip = true;
    console.log(LOG, "playback caught up to the stream, waiting for next clip");
  }
});

audioEl.addEventListener("error", () => {
  const error = audioEl.error;
  console.error(LOG, `audio element error: code=${error?.code} message=${error?.message}`);
  chrome.runtime.sendMessage({
    type: "vocalize:playback-error",
    error: `Audio decode error (code ${error?.code}): ${error?.message ?? "unknown"}`,
  });
});

async function loadAndPlay(
  streamUrl: string,
  text: string,
  voice: string,
  speed: number,
  pageUrl?: string
): Promise<void> {
  sessionId++;
  const mySession = sessionId;
  console.log(LOG, `loadAndPlay session=${mySession} textLen=${text.length} voice=${voice} pageUrl=${pageUrl}`);

  audioEl.pause();
  audioEl.removeAttribute("src");
  revokeClips();
  currentIndex = 0;
  waitingForNextClip = false;
  streamDone = false;
  state = "loading";
  reportState();

  let response: Response;
  try {
    response = await fetch(`${streamUrl}/api/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice, speed, page_url: pageUrl }),
    });
  } catch (error) {
    console.error(LOG, "fetch to /api/tts threw:", error);
    throw error;
  }
  console.log(
    LOG,
    `/api/tts response: status=${response.status} ok=${response.ok} hasBody=${!!response.body}`
  );
  if (!response.ok || !response.body) throw new Error(`TTS stream failed: ${response.status}`);

  const decoder = new FrameDecoder();
  const reader = response.body.getReader();
  let startedPlayback = false;
  let frameCount = 0;
  let byteCount = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (mySession !== sessionId) {
      console.log(LOG, `session=${mySession} superseded by session=${sessionId}, aborting read loop`);
      return;
    }
    if (done) break;
    byteCount += value.byteLength;
    const frames = decoder.push(value);
    for (const frame of frames) {
      const url = URL.createObjectURL(new Blob([frame.slice()], { type: "audio/wav" }));
      const duration = await probeDuration(url);
      if (mySession !== sessionId) {
        URL.revokeObjectURL(url);
        return;
      }
      frameCount++;
      clips.push({ url, duration });
      console.log(LOG, `queued clip ${frameCount} (${frame.byteLength} bytes, ${duration.toFixed(2)}s)`);
      if (!startedPlayback) {
        startedPlayback = true;
        playFrom(0);
      } else if (waitingForNextClip) {
        playFrom(currentIndex + 1);
      } else {
        reportState(); // duration total grew; let the slider's max keep up
      }
    }
  }

  streamDone = true;
  console.log(
    LOG,
    `stream done: ${byteCount} bytes received, ${frameCount} clip(s) queued, startedPlayback=${startedPlayback}`
  );
  if (!startedPlayback || waitingForNextClip) {
    // Either nothing ever played, or the stream ended exactly while we were
    // waiting for one more clip that never came (e.g. a dropped frame).
    state = "idle";
  }
  reportState();
}

function pause(): void {
  if (state !== "playing") return;
  audioEl.pause();
  state = "paused";
  reportState();
}

function resume(): void {
  if (state !== "paused") return;
  audioEl.play().catch((error) => console.error(LOG, "resume play() failed:", error));
  state = "playing";
  reportState();
}

function restart(): void {
  if (clips.length === 0) return;
  playFrom(0);
}

function stop(): void {
  sessionId++;
  audioEl.pause();
  audioEl.removeAttribute("src");
  revokeClips();
  currentIndex = 0;
  waitingForNextClip = false;
  streamDone = false;
  state = "idle";
  reportState();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  // Only act on messages the background script explicitly forwarded to us
  // (see service-worker.ts) — otherwise we'd also react to the original,
  // un-forwarded broadcast from the popup, double-handling every request.
  if (message?.target !== "offscreen") return false;

  console.log(LOG, "received", message.type, message);

  switch (message?.type) {
    case "vocalize:audio-play":
      loadAndPlay(message.serverUrl, message.text, message.voice, message.speed, message.pageUrl).catch(
        (error) => {
          console.error(LOG, "loadAndPlay failed:", error);
          chrome.runtime.sendMessage({ type: "vocalize:playback-error", error: String(error) });
        }
      );
      sendResponse({ ok: true });
      return true;
    case "vocalize:audio-pause":
      pause();
      sendResponse({ ok: true });
      return true;
    case "vocalize:audio-resume":
      resume();
      sendResponse({ ok: true });
      return true;
    case "vocalize:audio-restart":
      restart();
      sendResponse({ ok: true });
      return true;
    case "vocalize:audio-stop":
      stop();
      sendResponse({ ok: true });
      return true;
    case "vocalize:audio-seek":
      seekTo(Number(message.toSeconds) || 0);
      sendResponse({ ok: true });
      return true;
    case "vocalize:audio-seek-relative":
      seekBy(Number(message.deltaSeconds) || 0);
      sendResponse({ ok: true });
      return true;
    default:
      return false;
  }
});
