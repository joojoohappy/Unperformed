/**
 * Stage layout: StageFrame -> per-element transforms. Pure and renderer-agnostic,
 * so the WebGL stage and the 2D fallback draw the same choreography.
 */
import { type GeometryForm, type StageFrame, clamp, lerp, noise1, rng, smoothstep } from "@unperformed/performance-core";
import { type Look, lookFor } from "./look";
import type { Words } from "./words";

export const ELEMENT_COUNT = 240;
/** Size of one dot of a spelled word. */
const WORD_DOT = 0.1;

export interface Layout {
  /** x, y, z per element */
  position: Float32Array;
  /** euler x, y, z per element */
  rotation: Float32Array;
  /** sx, sy, sz per element */
  scale: Float32Array;
}

type Base = { p: [number, number, number]; r: [number, number, number]; s: [number, number, number] };

const cache = new Map<string, Base[]>();

function baseForm(form: GeometryForm, seed: number): Base[] {
  const key = `${form}:${seed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const r = rng(seed ^ form.length * 7919);
  const out: Base[] = [];
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    let b: Base;
    switch (form) {
      case "grid": {
        const cols = 16;
        const x = (i % cols) - (cols - 1) / 2;
        const z = Math.floor(i / cols) - 7;
        b = { p: [x * 0.42, 0.7, z * 0.42], r: [0, 0, 0], s: [0.05, 1.4, 0.05] };
        break;
      }
      case "lattice": {
        const n = 6;
        if (i >= n * n * n) {
          b = { p: [0, 1.6, 0], r: [0, 0, 0], s: [0, 0, 0] };
          break;
        }
        const x = (i % n) - (n - 1) / 2;
        const y = Math.floor(i / n) % n;
        const z = Math.floor(i / (n * n)) - (n - 1) / 2;
        b = { p: [x * 0.62, 0.3 + y * 0.55, z * 0.62], r: [0, 0, 0], s: [0.1, 0.1, 0.1] };
        break;
      }
      case "shards": {
        const a = r() * Math.PI * 2;
        const rad = 0.6 + r() * 3.6;
        b = {
          p: [Math.cos(a) * rad, 0.2 + r() * 2.8, Math.sin(a) * rad * 0.8],
          r: [r() * Math.PI, r() * Math.PI, r() * Math.PI],
          s: [0.05, 0.3 + r() * 1.5, 0.02 + r() * 0.08]
        };
        break;
      }
      case "ring": {
        const a = (i / ELEMENT_COUNT) * Math.PI * 2;
        const h = 1.2 + 0.6 * Math.sin(a * 3);
        b = { p: [Math.cos(a) * 3.6, h / 2, Math.sin(a) * 3.6], r: [0, -a, 0], s: [0.04, h, 0.04] };
        break;
      }
      case "dust":
        b = { p: [(r() - 0.5) * 9, 0.1 + r() * 3.6, (r() - 0.5) * 6], r: [r() * 3, r() * 3, r() * 3], s: [0.035, 0.035, 0.035] };
        break;
      case "monolith":
        b =
          i === 0
            ? { p: [0, 1.8, 0], r: [0, 0, 0], s: [1.1, 3.6, 0.32] }
            : { p: [(r() - 0.5) * 8, r() * 3, (r() - 0.5) * 5], r: [0, 0, 0], s: [0.02, 0.02, 0.02] };
        break;
      case "void":
      default:
        b = { p: [(r() - 0.5) * 6, 0.1 + r() * 2, (r() - 0.5) * 4], r: [0, 0, 0], s: [0, 0, 0] };
    }
    out.push(b);
  }
  cache.set(key, out);
  return out;
}

export function createLayout(): Layout {
  return {
    position: new Float32Array(ELEMENT_COUNT * 3),
    rotation: new Float32Array(ELEMENT_COUNT * 3),
    scale: new Float32Array(ELEMENT_COUNT * 3)
  };
}

/**
 * Fill `out` for this frame. Deterministic for (frame, seed, words).
 * `words` holds per-section dot targets for the section names; a null entry
 * (or none) leaves that section to its geometric form alone.
 */
export function computeLayout(frame: StageFrame, seed: number, out: Layout, reducedMotion = false, look: Look = lookFor(frame), words: Words = []): Layout {
  const from = baseForm(frame.geometry.from, seed);
  const to = baseForm(frame.geometry.to, seed);
  const mix = frame.geometry.mix;
  const chaos = 1 - frame.geometry.order;
  const visible = frame.geometry.density * ELEMENT_COUNT;
  const motion = reducedMotion ? 0.15 : 1;
  const t = frame.beat * 0.12;
  const ease = smoothstep(frame.progress);
  const L = look;
  // The name moves with the art direction: during a transition the previous section's word dissolves into this one.
  const wordTo = words[frame.sectionIndex] ?? null;
  const wordFrom = frame.look.mix < 1 ? (words[frame.sectionIndex - 1] ?? null) : wordTo;
  // Dots a fraction of the way between word and form read as neither, so the hold is sharpened:
  // ordered sections spell clearly, broken ones only hint at their word.
  const hold = smoothstep(clamp((L.word * (0.6 + 0.4 * frame.geometry.order) - 0.3) / 0.5));
  const wordMix = wordFrom === wordTo ? 1 : frame.look.mix;
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    const a = from[i]!;
    const b = to[i]!;
    const k = i * 3;
    const jitter = chaos * chaos;
    // A fixed per-element phase, so staggered motions do not move in lockstep.
    const u = (i * 0.6180339) % 1;
    // Disorder: a fixed displacement per element plus slow wandering, both scaled by chaos.
    const dx = noise1(seed + i, 3.1) * 2.6 * jitter + noise1(seed + i * 3, t) * 0.5 * chaos * frame.energy * motion;
    const dy = noise1(seed + i * 5, 1.7) * 1.2 * jitter + noise1(seed + i * 7, t + 11) * 0.3 * chaos * frame.energy * motion;
    const dz = noise1(seed + i * 11, 5.3) * 2.0 * jitter + noise1(seed + i * 13, t + 23) * 0.5 * chaos * frame.energy * motion;
    let x = lerp(a.p[0], b.p[0], mix) + dx;
    let y = lerp(a.p[1], b.p[1], mix) + dy;
    let z = lerp(a.p[2], b.p[2], mix) + dz;
    let sy = lerp(a.s[1], b.s[1], mix);
    let rz = lerp(a.r[2], b.r[2], mix);
    let sx = lerp(a.s[0], b.s[0], mix);
    let sz = lerp(a.s[2], b.s[2], mix);

    // The section's name, spelled in dots. A section without a legible word fades its hold in or out.
    let w = 0;
    if (hold > 0 && (wordFrom || wordTo)) {
      const src = wordFrom ?? wordTo!;
      const dst = wordTo ?? wordFrom!;
      w = hold * (wordFrom && wordTo ? 1 : wordTo ? wordMix : 1 - wordMix);
      const wx = lerp(src[i * 2]!, dst[i * 2]!, wordMix);
      const wy = lerp(src[i * 2 + 1]!, dst[i * 2 + 1]!, wordMix);
      x = lerp(x, wx + dx * 0.12, w);
      y = lerp(y, wy + dy * 0.12, w);
      z = lerp(z, dz * 0.15, w);
      sx = lerp(sx, WORD_DOT, w);
      sy = lerp(sy, WORD_DOT, w);
      sz = lerp(sz, WORD_DOT, w);
      rz = lerp(rz, 0, w);
    }

    // Art direction by section type (see look.ts). Weights blend during transitions.
    if (L.breathe > 0) sy *= 1 + 0.2 * L.breathe * motion * Math.sin(x * 0.8 + t * 2);
    if (L.lift > 0) {
      // A spelled word rises as one piece, so it stays legible.
      const stagger = u * (1 - w);
      const rise = smoothstep(clamp(frame.progress * 1.6 - stagger * 0.6));
      y = lerp(y, 0.04 + (y - 0.04) * rise + 0.5 * stagger * rise, L.lift);
      sy *= lerp(1, 0.25 + 0.75 * rise, L.lift);
    }
    if (L.split > 0) {
      const side = x > 0.05 ? 1 : x < -0.05 ? -1 : u > 0.5 ? 1 : -1;
      x += side * L.split * (0.25 + 1.5 * ease);
      rz += side * L.split * 0.35 * ease;
    }
    if (L.burst > 0) {
      const ox = x, oy = y - 1.2, oz = z;
      const d = Math.hypot(ox, oy, oz) || 1;
      const push = L.burst * (0.3 + 2.6 * frame.energy * frame.energy) * (0.6 + 0.8 * u);
      x += (ox / d) * push;
      y += (oy / d) * push * 0.6 + L.burst * frame.energy * 0.4;
      z += (oz / d) * push;
    }
    if (L.sink > 0) {
      const settle = L.sink * smoothstep(clamp(frame.progress * 1.3 - u * 0.3));
      y = lerp(y, 0.05 + y * 0.12, settle);
      rz *= 1 - 0.7 * settle;
    }
    if (L.gather > 0) {
      const g = L.gather * 0.9;
      x = lerp(x, noise1(seed + i * 29, 0.5) * 0.6, g);
      y = lerp(y, 0.6 + u * 1.8, g);
      z = lerp(z, noise1(seed + i * 31, 0.5) * 0.4, g);
    }
    if (L.current > 0) {
      x += L.current * motion * 1.5 * Math.sin(t * 0.45 + u * Math.PI * 2);
      y += L.current * motion * 0.35 * Math.sin(t * 0.6 + u * 9);
    }

    out.position[k] = x;
    out.position[k + 1] = Math.max(0.02, y);
    out.position[k + 2] = z;
    const spin = chaos * Math.PI * 0.9;
    out.rotation[k] = lerp(a.r[0], b.r[0], mix) + noise1(seed + i * 17, 2.2) * spin;
    out.rotation[k + 1] = lerp(a.r[1], b.r[1], mix) + noise1(seed + i * 19, 4.4 + t * 0.3 * motion) * spin;
    out.rotation[k + 2] = rz + noise1(seed + i * 23, 6.6) * spin;
    // While a word holds, all of it shows; density thins only the geometric form.
    const fade = Math.max(clamp(visible - i), w) * L.scale;
    out.scale[k] = sx * fade;
    out.scale[k + 1] = sy * fade;
    out.scale[k + 2] = sz * fade;
  }
  return out;
}
