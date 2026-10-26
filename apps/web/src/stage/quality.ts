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
/** A window holds at most this many frames... */
export const WINDOW_FRAMES = 120;
/** ...or ends once it spans this long (with at least MIN_FRAMES). */
export const WINDOW_MS = 1000;
const MIN_FRAMES = 10;
/**
 * Consecutive slow windows needed to reduce. One window is not enough: on an
 * iPhone 17 Pro a full-quality run had a p95 of 18 ms overall, but short
 * hitches (starting playback, the browser's own work) pushed single windows
 * over budget. A burst under about 1 s can never fill three windows in a row.
 */
export const STRIKES = 3;
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
  private spanMs = 0;
  private strikes = 0;

  constructor(mode: QualityMode = "auto") {
    this.auto = mode === "auto";
    this.level = mode === "reduced" ? "reduced" : "full";
  }

  /** Record one frame interval in ms. Returns true when the level changed. */
  push(ms: number): boolean {
    if (!this.auto || this.level === "reduced") return false;
    if (!(ms > 0) || ms > MAX_INTERVAL_MS) return false;
    if (++this.seen <= WARMUP_FRAMES) return false;
    this.window[this.filled++] = ms;
    this.spanMs += ms;
    if (this.filled < WINDOW_FRAMES && (this.filled < MIN_FRAMES || this.spanMs < WINDOW_MS)) return false;
    const slow = p95(this.window.subarray(0, this.filled)) > FRAME_BUDGET_MS;
    this.filled = 0;
    this.spanMs = 0;
    this.strikes = slow ? this.strikes + 1 : 0;
    if (this.strikes < STRIKES) return false;
    this.level = "reduced";
    return true;
  }
}
