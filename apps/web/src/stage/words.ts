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

/** x, y per element in stage units, or null when a name cannot be spelled legibly. */
export type WordTargets = Float32Array;
export type Words = readonly (WordTargets | null)[];

const W = 512;
const H = 160;
/** Stage width of the word, centred on the light. */
const WIDTH = 5.4;
const CENTRE_Y = 1.45;
/** Coarsest legible grid: below this many dot rows per line of text the word is noise. */
const MIN_ROWS = 9;
const FONT = `700 SIZEpx system-ui, -apple-system, "PingFang TC", "Noto Sans CJK TC", "Microsoft JhengHei", sans-serif`;

let canvas: HTMLCanvasElement | null = null;

/**
 * Dot targets for one name. Dots are split on a checkerboard: one half goes to
 * even elements and one to odd, so the reduced-quality stage (every second
 * element) still draws the whole word, only sparser. Within each half the order
 * is interleaved, so a low density thins the word instead of cutting it off.
 */
export function wordTargets(name: string): WordTargets | null {
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

  // The coarsest grid whose lit cells fit the element count.
  let dots: { x: number; y: number; even: boolean }[] = [];
  let step = 3;
  for (; step < 40; step += 0.5) {
    const found: typeof dots = [];
    let row = 0;
    for (let y = step / 2; y < H; y += step, row++) {
      let col = 0;
      for (let x = step / 2; x < W; x += step, col++) {
        if (data[(Math.floor(y) * W + Math.floor(x)) * 4 + 3]! > 110) found.push({ x, y, even: (row + col) % 2 === 0 });
      }
    }
    if (found.length <= ELEMENT_COUNT) {
      dots = found;
      break;
    }
  }
  if (!dots.length || size / step < MIN_ROWS) return null;

  const halves = [dots.filter((d) => d.even), dots.filter((d) => !d.even)];
  const out = new Float32Array(ELEMENT_COUNT * 2);
  const scale = WIDTH / W;
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    const half = halves[i % 2]!.length ? halves[i % 2]! : halves[(i + 1) % 2]!;
    const d = half[spread(Math.floor(i / 2) % half.length, half.length)]!;
    out[i * 2] = (d.x - W / 2) * scale;
    out[i * 2 + 1] = CENTRE_Y - (d.y - H / 2) * scale;
  }
  return out;
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

/** Changes when any section name changes, so the stage knows to respell. */
export function wordKey(score: PerformanceScore): string {
  return score.sections.map((s) => s.name).join("\u0000");
}

export function wordsFor(score: PerformanceScore): Words {
  return score.sections.map((s) => wordTargets(s.name));
}
