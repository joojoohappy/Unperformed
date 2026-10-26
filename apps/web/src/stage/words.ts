/**
 * Section names as stage material. Each section's name is rasterised once and
 * turned into a dot-matrix target for the elements, so the stage spells what
 * the section is about before its motion (split, burst, sink...) acts on it.
 *
 * This is the only part of the stage that reads the DOM (a 2D canvas for the
 * glyphs, in the device's own fonts); layout.ts stays pure and receives the
 * targets as data.
 */
import type { PerformanceScore } from "@unperformed/performance-core";
import { ELEMENT_COUNT } from "./layout";

/** x, y per element in stage units, and the size of one dot. */
export interface WordTargets {
  xy: Float32Array;
  dot: number;
}
/** By section index; null where a name cannot be spelled legibly. */
export type Words = readonly (WordTargets | null)[];

export interface SpellOptions {
  /** Distinct dots available: every element, or every second one at reduced quality. */
  dots: number;
  /** Stage width the word may use (see wordWidth). */
  width: number;
}

const W = 512;
const H = 160;
/** Coarsest legible grid: below this many dot rows per line of text the word is noise. */
const MIN_ROWS = 9;
/** Tallest the word may be, so it stays in frame while the camera moves. */
const MAX_HEIGHT = 3;
/** Dot size as a share of the grid step, so neighbouring dots stay apart. */
const DOT_FILL = 0.78;
const FONT = `700 SIZEpx system-ui, -apple-system, "PingFang TC", "Noto Sans CJK TC", "Microsoft JhengHei", sans-serif`;

let canvas: HTMLCanvasElement | null = null;

/**
 * The widest the word may be for a stage of this aspect ratio: most of what
 * the resting camera (z 9.5, 42° vertical field) sees at centre stage, so a
 * portrait phone gets a narrower word instead of one cut off at the edges.
 */
export function wordWidth(aspect: number): number {
  const visible = 2 * 9.5 * Math.tan((21 * Math.PI) / 180) * aspect;
  return Math.min(8, visible * 0.82);
}

/**
 * Dot targets for one name. With all elements drawn, element i takes dot i; at
 * reduced quality only every second element is drawn, so the word is sampled
 * with half the dots and each dot goes to a pair of elements. Dots are visited
 * in a spread-out order, so a low density thins the word instead of cutting it off.
 */
export function wordTargets(name: string, { dots: max, width }: SpellOptions): WordTargets | null {
  const text = name.trim();
  if (!text) return null;
  canvas ??= document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const g = canvas.getContext("2d", { willReadFrequently: true });
  if (!g) return null;
  let size = 140;
  const font = (s: number) => FONT.replace("SIZE", String(s));
  g.font = font(size);
  while (g.measureText(text).width > W * 0.96 && size > 20) g.font = font((size -= 4));
  g.clearRect(0, 0, W, H);
  g.fillStyle = "#fff";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, W / 2, H / 2);
  const data = g.getImageData(0, 0, W, H).data;

  // The finest grid whose lit cells fit the dots available.
  let found: [number, number][] = [];
  let step = 3;
  for (; step < 40; step += 0.25) {
    found = [];
    for (let y = step / 2; y < H; y += step) {
      for (let x = step / 2; x < W; x += step) if (data[(Math.floor(y) * W + Math.floor(x)) * 4 + 3]! > 110) found.push([x, y]);
    }
    if (found.length <= max) break;
  }
  if (!found.length || found.length > max || size / step < MIN_ROWS) return null;

  // Size the word to the stage, and keep it clear of the floor.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of found) {
    x0 = Math.min(x0, x); x1 = Math.max(x1, x);
    y0 = Math.min(y0, y); y1 = Math.max(y1, y);
  }
  const scale = Math.min(width / (x1 - x0 + step), MAX_HEIGHT / (y1 - y0 + step));
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const centreY = Math.max(1.45, ((y1 - y0 + step) * scale) / 2 + 0.35);
  const pair = max < ELEMENT_COUNT ? 2 : 1;
  const xy = new Float32Array(ELEMENT_COUNT * 2);
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    const n = found.length;
    const [x, y] = found[spread(Math.floor(i / pair) % n, n)]!;
    xy[i * 2] = (x - cx) * scale;
    xy[i * 2 + 1] = centreY - (y - cy) * scale;
  }
  return { xy, dot: step * scale * DOT_FILL };
}

/** A permutation of 0..n-1 that visits the word in a spread-out order (a stride coprime with n near n/φ). */
function spread(j: number, n: number): number {
  let k = Math.max(1, Math.round(n * 0.618));
  while (gcd(k, n) !== 1) k++;
  return (j * k) % n;
}

function gcd(a: number, b: number): number {
  return b ? gcd(b, a % b) : a;
}

/** Changes when a name or the spelling options change, so the stage knows to respell. */
export function wordKey(score: PerformanceScore, opts: SpellOptions): string {
  return [opts.dots, opts.width.toFixed(2), ...score.sections.map((s) => s.name)].join("\u0000");
}

export function wordsFor(score: PerformanceScore, opts: SpellOptions): Words {
  return score.sections.map((s) => wordTargets(s.name, opts));
}
