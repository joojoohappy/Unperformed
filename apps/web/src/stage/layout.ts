/**
 * Stage layout: StageFrame -> per-element transforms. Pure and renderer-agnostic,
 * so the WebGL stage and the 2D fallback draw the same choreography.
 */
import { type GeometryForm, type StageFrame, clamp, lerp, noise1, rng } from "@unperformed/performance-core";

export const ELEMENT_COUNT = 240;

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

/** Fill `out` for this frame. Deterministic for (frame, seed). */
export function computeLayout(frame: StageFrame, seed: number, out: Layout, reducedMotion = false): Layout {
  const from = baseForm(frame.geometry.from, seed);
  const to = baseForm(frame.geometry.to, seed);
  const mix = frame.geometry.mix;
  const chaos = 1 - frame.geometry.order;
  const visible = frame.geometry.density * ELEMENT_COUNT;
  const motion = reducedMotion ? 0.15 : 1;
  const t = frame.beat * 0.12;
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    const a = from[i]!;
    const b = to[i]!;
    const k = i * 3;
    const jitter = chaos * chaos;
    // Disorder: a fixed displacement per element plus slow wandering, both scaled by chaos.
    const dx = noise1(seed + i, 3.1) * 2.6 * jitter + noise1(seed + i * 3, t) * 0.5 * chaos * frame.energy * motion;
    const dy = noise1(seed + i * 5, 1.7) * 1.2 * jitter + noise1(seed + i * 7, t + 11) * 0.3 * chaos * frame.energy * motion;
    const dz = noise1(seed + i * 11, 5.3) * 2.0 * jitter + noise1(seed + i * 13, t + 23) * 0.5 * chaos * frame.energy * motion;
    out.position[k] = lerp(a.p[0], b.p[0], mix) + dx;
    out.position[k + 1] = Math.max(0.02, lerp(a.p[1], b.p[1], mix) + dy);
    out.position[k + 2] = lerp(a.p[2], b.p[2], mix) + dz;
    const spin = chaos * Math.PI * 0.9;
    out.rotation[k] = lerp(a.r[0], b.r[0], mix) + noise1(seed + i * 17, 2.2) * spin;
    out.rotation[k + 1] = lerp(a.r[1], b.r[1], mix) + noise1(seed + i * 19, 4.4 + t * 0.3 * motion) * spin;
    out.rotation[k + 2] = lerp(a.r[2], b.r[2], mix) + noise1(seed + i * 23, 6.6) * spin;
    const fade = clamp(visible - i);
    out.scale[k] = lerp(a.s[0], b.s[0], mix) * fade;
    out.scale[k + 1] = lerp(a.s[1], b.s[1], mix) * fade;
    out.scale[k + 2] = lerp(a.s[2], b.s[2], mix) * fade;
  }
  return out;
}
