/**
 * Adaptive render quality. The stage watches its own frame intervals and, if
 * the 95th percentile stays above the frame budget, drops to a cheaper level:
 * half the elements, no haze, and about half the pixels (pixel ratio 1, then
 * 0.7 of that per axis). The choreography is unchanged. The stage is mostly
 * fill-bound (lit floor, standard material), so the resolution matters most.
 */
export type Quality = "full" | "reduced";
export type QualityMode = "auto" | Quality;

export interface QualitySettings {
  /** Draw every n-th element of the layout. */
  elementStride: number;
  haze: boolean;
  maxPixelRatio: number;
  /** Multiplies the (capped) pixel ratio; the canvas is scaled up by CSS. */
  resolutionScale: number;
}

export function pixelRatio(devicePixelRatio: number, q: QualitySettings): number {
  return Math.min(devicePixelRatio, q.maxPixelRatio) * q.resolutionScale;
}

export const QUALITY: Record<Quality, QualitySettings> = {
  full: { elementStride: 1, haze: true, maxPixelRatio: 2, resolutionScale: 1 },
  reduced: { elementStride: 2, haze: false, maxPixelRatio: 1, resolutionScale: 0.7 }
};

/** p95 frame time above this (ms) means the stage is missing ~50 fps. */
export const FRAME_BUDGET_MS = 20;
/** Frames ignored at start (shader compile, first layout). */
export const WARMUP_FRAMES = 20;
/** At most this many recent frames are kept. */
export const WINDOW_FRAMES = 120;
/**
 * The window is judged once it is full, or once it spans this long: a device
 * at 12 fps should not wait 10 s at full quality for 120 frames.
 */
export const WINDOW_MS = 2000;
const MIN_FRAMES = 20;
/** How often (in frames) the window is checked. */
const CHECK_EVERY = 10;
/** Intervals longer than this are pauses (hidden tab, debugger), not slow frames. */
const MAX_INTERVAL_MS = 250;

export function qualityModeFromSearch(search: string): QualityMode {
  const q = new URLSearchParams(search).get("quality");
  return q === "full" || q === "reduced" ? q : "auto";
}

export function p95(values: ArrayLike<number>): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))]! : 0;
}

/**
 * Decides the render quality from frame intervals. In "auto" it only ever
 * steps down: going back up would make a slow device oscillate between levels
 * in the middle of a performance.
 */
export class AdaptiveQuality {
  level: Quality;
  private readonly auto: boolean;
  private seen = 0;
  private window = new Float64Array(WINDOW_FRAMES);
  private filled = 0;
  private next = 0;
  private spanMs = 0;

  constructor(mode: QualityMode = "auto") {
    this.auto = mode === "auto";
    this.level = mode === "reduced" ? "reduced" : "full";
  }

  /** Record one frame interval in ms. Returns true when the level changed. */
  push(ms: number): boolean {
    if (!this.auto || this.level === "reduced") return false;
    if (!(ms > 0) || ms > MAX_INTERVAL_MS) return false;
    if (++this.seen <= WARMUP_FRAMES) return false;
    this.spanMs += ms - (this.filled === WINDOW_FRAMES ? this.window[this.next]! : 0);
    this.window[this.next] = ms;
    this.next = (this.next + 1) % WINDOW_FRAMES;
    if (this.filled < WINDOW_FRAMES) this.filled++;
    const ready = this.filled === WINDOW_FRAMES || (this.filled >= MIN_FRAMES && this.spanMs >= WINDOW_MS);
    if (!ready || this.seen % CHECK_EVERY !== 0) return false;
    if (p95(this.window.subarray(0, this.filled)) <= FRAME_BUDGET_MS) return false;
    this.level = "reduced";
    return true;
  }
}
