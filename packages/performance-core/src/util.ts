/** Small deterministic helpers shared by the compiler, timeline and renderers. */

export type RGB = [number, number, number];

export const clamp = (v: number, lo = 0, hi = 1): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (t: number): number => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
export const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** Mulberry32: tiny, fast, deterministic PRNG. Same seed gives the same sequence everywhere. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable 32-bit hash of a string (FNV-1a). Used to derive seeds from intent text. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) & 0x7fffffff;
}

/** Deterministic value noise in [-1, 1] for a seed and a continuous position. */
export function noise1(seed: number, x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n: number) => {
    let v = Math.imul((n + seed) ^ 0x9e3779b9, 0x85ebca6b);
    v ^= v >>> 13;
    v = Math.imul(v, 0xc2b2ae35);
    v ^= v >>> 16;
    return ((v >>> 0) / 4294967295) * 2 - 1;
  };
  return lerp(h(i), h(i + 1), smoothstep(f));
}

export function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  const to = (v: number) => Math.round(clamp(v) * 255).toString(16).padStart(2, "0");
  return `#${to(r)}${to(g)}${to(b)}`;
}

export function mixRgb(a: RGB, b: RGB, t: number): RGB {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Relative luminance per WCAG 2.x (input in 0..1 sRGB). */
export function relativeLuminance([r, g, b]: RGB): number {
  const lin = (c: number) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** Shift a colour toward warm (positive) or cold (negative) by a small amount. */
export function warmShift(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex([clamp(r + amount * 0.25), clamp(g + amount * 0.05), clamp(b - amount * 0.25)]);
}
