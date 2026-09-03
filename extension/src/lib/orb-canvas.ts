/**
 * Lightweight canvas "thinking orb" — dots orbiting a glowing core.
 * Inspired by thinking-orbs (github.com/Jakubantalik/thinking-orbs): plain 2D
 * canvas only (no WebGL/filters), dpr capped at 2, static frame under
 * prefers-reduced-motion. Reimplemented directly since this extension has no
 * React dependency to hang that package's component API off of.
 */
import type { PlaybackState } from "./types";

const DOT_COUNT = 7;
const MAX_DPR = 2;

const SPEED_BY_STATE: Record<PlaybackState, number> = {
  idle: 0.08,
  loading: 0.6,
  playing: 1.0,
  paused: 0.15,
};

const GLOW_BY_STATE: Record<PlaybackState, number> = {
  idle: 4,
  loading: 10,
  playing: 16,
  paused: 6,
};

export class OrbCanvas {
  private ctx: CanvasRenderingContext2D;
  private state: PlaybackState = "idle";
  private angle = 0;
  private rafId: number | null = null;
  private lastTime = 0;
  private reducedMotion: boolean;

  constructor(private canvas: HTMLCanvasElement, private accentColor = "#f54e00") {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas context unavailable");
    this.ctx = ctx;
    this.reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.resize();
    if (this.reducedMotion) {
      this.drawFrame(0);
    } else {
      this.start();
    }
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const size = this.canvas.clientWidth || 56;
    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setState(state: PlaybackState): void {
    this.state = state;
    if (this.reducedMotion) this.drawFrame(this.angle);
  }

  setAccentColor(color: string): void {
    this.accentColor = color;
    if (this.reducedMotion) this.drawFrame(this.angle);
  }

  private start(): void {
    const loop = (time: number) => {
      const dt = this.lastTime ? time - this.lastTime : 16;
      this.lastTime = time;
      this.angle += dt * 0.002 * SPEED_BY_STATE[this.state];
      this.drawFrame(this.angle);
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  stop(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
  }

  private drawFrame(angle: number): void {
    const size = this.canvas.clientWidth || 56;
    const cx = size / 2;
    const cy = size / 2;
    const orbitRadius = size * 0.32;
    const glow = GLOW_BY_STATE[this.state];

    this.ctx.clearRect(0, 0, size, size);

    // Core
    this.ctx.beginPath();
    this.ctx.arc(cx, cy, size * 0.18, 0, Math.PI * 2);
    this.ctx.fillStyle = this.accentColor;
    this.ctx.shadowColor = this.accentColor;
    this.ctx.shadowBlur = glow;
    this.ctx.globalAlpha = this.state === "idle" ? 0.55 : 1;
    this.ctx.fill();

    // Orbiting dots
    for (let i = 0; i < DOT_COUNT; i++) {
      const theta = angle + (i / DOT_COUNT) * Math.PI * 2;
      const wobble = Math.sin(angle * 2 + i) * (size * 0.03);
      const x = cx + Math.cos(theta) * (orbitRadius + wobble);
      const y = cy + Math.sin(theta) * (orbitRadius * 0.55 + wobble);
      const dotSize = size * (0.035 + (i % 3) * 0.01);

      this.ctx.beginPath();
      this.ctx.arc(x, y, dotSize, 0, Math.PI * 2);
      this.ctx.fillStyle = this.accentColor;
      this.ctx.shadowBlur = glow * 0.6;
      this.ctx.globalAlpha = this.state === "idle" ? 0.35 : 0.85;
      this.ctx.fill();
    }

    this.ctx.globalAlpha = 1;
    this.ctx.shadowBlur = 0;
  }
}
