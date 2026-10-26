/**
 * The stage set: the set pieces chosen for this idea (score.set), placed and
 * moved for one frame. StageFrame + StageSet -> transforms and light levels.
 * Pure and renderer-agnostic: the same frame, seed and set always give the
 * same stage, so scrubbing, the 2D fallback and the WebGL stage agree.
 *
 * The set decides what stands on the stage and how much of it: more pillars,
 * shards, strings, lasers or screens for a richer description. The section
 * types decide what happens to it (weights from look.ts, blended over transitions):
 *   order     still and cold, strings hanging straight, screens on a quiet line;
 *   build     energy rises, strings sway, shards lift, lasers open, bars climb;
 *   drift     the same loss of control, slower and wider;
 *   fracture  pillars crack along a cut, lasers tilt, screens glitch;
 *   climax    the set bursts apart, lasers sweep the hall, screens flare;
 *   release   everything lies on the floor, lasers sink, light drains;
 *   silence   the set is gone; one beam and its reflection remain.
 *
 * Nothing flickers faster than the timeline allows: motion is a slow function
 * of the beat, and patterns that jump (screen glitches) change at most every
 * two beats, which is under 1.4 Hz at the fastest tempo (160 BPM).
 */
import { DEFAULT_SET, type Floor, type PropKind, type StageFrame, type StageSet, clamp, lerp, rng, setAmount, smoothstep } from "@unperformed/performance-core";
import { type Look, lookFor } from "./look";
import { ELEMENT_COUNT } from "./layout";
import type { Words } from "./words";

export const CHUNKS_PER_PILLAR = 7;
/** x, z, height, width; mirrored left and right; added in this order as the amount grows. */
const PILLARS: [number, number, number, number][] = [
  [3.9, -3.4, 5.6, 0.72],
  [2.7, -4.6, 4.4, 0.62],
  [6.6, -1.4, 8.2, 0.95],
  [1.8, -5.9, 3.4, 0.5]
];
export const MAX_PILLAR_PIECES = PILLARS.length * 2 * CHUNKS_PER_PILLAR;
export const RING_PIECES = 48;
export const MAX_SHARDS = 200;
export const MAX_STRINGS = 140;
export const STRING_SEGMENTS = 12;
export const STRING_TOP = 14;
export const MAX_EMITTERS = 4;
export const LASERS_PER_EMITTER = 7;
export const LASER_LENGTH = 26;
export const MAX_PANELS = 5;
export const SCREEN_COLS = 16;
export const SCREEN_ROWS = 10;
export const MAX_BEAMS = 5;
const MONOLITH_Z = -6.8;
const SCREEN_Z = -8.6;
/** Monolith, then its three steps: width, height, depth, centre y, centre z. */
const MONOLITH: [number, number, number, number, number][] = [
  [1.3, 2.6, 0.5, 0.54 + 1.3, MONOLITH_Z],
  [5.2, 0.18, 2.4, 0.09, -6.3],
  [4.2, 0.18, 1.9, 0.27, -6.45],
  [3.2, 0.18, 1.4, 0.45, -6.6]
];

export interface Pieces {
  count: number;
  /** x, y, z per piece */
  position: Float32Array;
  /** euler x, y, z per piece */
  rotation: Float32Array;
  /** sx, sy, sz per piece */
  scale: Float32Array;
}

export interface Lines {
  count: number;
  /** Two x, y, z vertices per line segment. */
  vertices: Float32Array;
  /** Brightness per segment, 0..1. */
  light: Float32Array;
}

export interface SetScene {
  floor: Floor;
  pillars: Pieces;
  monolith: Pieces;
  ring: Pieces;
  shards: Pieces;
  /** The section's name in dots (from words.ts), for the words piece. */
  words: Pieces;
  strings: Lines;
  lasers: Lines;
  /** x, y, z, width, height per LED panel. */
  panels: Float32Array;
  panelCount: number;
  /** Brightness per cell, panel by panel, row by row from the bottom. */
  cells: Float32Array;
  /** x at the top, x on the floor, brightness per beam. */
  beams: Float32Array;
  beamCount: number;
  /** Colour of the energy on stage (key light turning to the accent), and how much of it. */
  energyColor: [number, number, number];
  energy: number;
  /** 0..1 levels for the renderer. */
  ringLight: number;
  wordLight: number;
  haze: number;
  backGlow: number;
  /** Overall light, after blackout. */
  light: number;
}

const pieces = (n: number): Pieces => ({ count: 0, position: new Float32Array(n * 3), rotation: new Float32Array(n * 3), scale: new Float32Array(n * 3) });
const lines = (n: number): Lines => ({ count: 0, vertices: new Float32Array(n * 6), light: new Float32Array(n) });

export function createSetScene(): SetScene {
  return {
    floor: "mirror",
    pillars: pieces(MAX_PILLAR_PIECES),
    monolith: pieces(MONOLITH.length),
    ring: pieces(RING_PIECES),
    shards: pieces(MAX_SHARDS),
    words: pieces(ELEMENT_COUNT),
    strings: lines(MAX_STRINGS * STRING_SEGMENTS),
    lasers: lines(MAX_EMITTERS * LASERS_PER_EMITTER),
    panels: new Float32Array(MAX_PANELS * 5),
    panelCount: 0,
    cells: new Float32Array(MAX_PANELS * SCREEN_COLS * SCREEN_ROWS),
    beams: new Float32Array(MAX_BEAMS * 3),
    beamCount: 0,
    energyColor: [1, 1, 1],
    energy: 0,
    ringLight: 0,
    wordLight: 0,
    haze: 0,
    backGlow: 0,
    light: 1
  };
}

/** How many of each piece a set puts on stage. More of a piece in the set, more of it on stage. */
export function setCounts(set: StageSet) {
  const a = (k: PropKind) => setAmount(set, k);
  const has = (k: PropKind) => set.pieces.some((p) => p.kind === k);
  const amt = a("beam");
  return {
    pillarPairs: has("pillars") ? 1 + Math.round(a("pillars") * 3) : 0,
    monolith: has("monolith") ? 0.75 + 0.5 * a("monolith") : 0,
    ring: has("ring") ? 2.2 + 1.0 * a("ring") : 0,
    shards: has("shards") ? Math.round(40 + a("shards") * (MAX_SHARDS - 40)) : 0,
    strings: has("strings") ? Math.round(30 + a("strings") * (MAX_STRINGS - 30)) : 0,
    emitters: has("lasers") ? 2 + Math.round(a("lasers") * 2) : 0,
    panels: has("screens") ? 1 + Math.round(a("screens") * (MAX_PANELS - 1)) : 0,
    beams: !has("beam") ? 1 : amt < 0.4 ? 1 : amt < 0.75 ? 3 : 5,
    words: has("words") ? 0.6 + 0.4 * a("words") : 0,
    haze: has("haze") ? 0.4 + 0.6 * a("haze") : 0.25
  };
}

interface Piece {
  /** Intact position, rotation (y only) and size. */
  p: [number, number, number];
  ry: number;
  s: [number, number, number];
  /** Where it flies when the set bursts, and how it tumbles. */
  fly: [number, number, number];
  spin: [number, number, number];
  /** Where it comes to rest on the floor, and how it lies. */
  rest: [number, number, number];
  lie: [number, number, number];
  /** Sideways shift along the crack (0 below the cut). */
  crack: number;
  phase: number;
}

interface Built {
  counts: ReturnType<typeof setCounts>;
  pillars: Piece[];
  monolith: Piece[];
  ring: Piece[];
  shards: Piece[];
  /** Per word dot: where it flies and where it falls. */
  dots: { fly: [number, number, number]; rest: [number, number]; phase: number }[];
  strings: { x: number; z: number; phase: number; bright: number }[];
  emitters: { x: number; phase: number }[];
}

const cache = new Map<string, Built>();

function build(seed: number, set: StageSet): Built {
  const key = `${seed}:${JSON.stringify(set)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 16) cache.clear();
  const counts = setCounts(set);
  const r = rng(seed ^ 0x7e3a1);
  const outward = (x: number, z: number): [number, number] => {
    const l = Math.hypot(x, z + 4) || 1;
    return [x / l, (z + 4) / l];
  };
  const thrown = (p: [number, number, number], s: [number, number, number], far: number, restNear: number): Piece => {
    const [ox, oz] = outward(p[0], p[2]);
    return {
      p,
      ry: 0,
      s,
      fly: [p[0] + ox * far + (r() - 0.5) * 2, p[1] + 1 + r() * 4, p[2] + oz * far + (r() - 0.5) * 2],
      spin: [(r() - 0.5) * 5, (r() - 0.5) * 5, (r() - 0.5) * 5],
      rest: [p[0] + ox * restNear * r() + (r() - 0.5) * 1.2, Math.min(s[0], s[1]) * 0.41, p[2] + oz * restNear * r() + (r() - 0.5) * 1.5],
      lie: [(Math.PI / 2) * (r() < 0.6 ? 1 : 0), r() * Math.PI, (r() - 0.5) * 0.6],
      crack: 0,
      phase: r()
    };
  };

  const pillars: Piece[] = [];
  for (const [px, pz, h, w] of PILLARS.slice(0, counts.pillarPairs)) {
    for (const side of [-1, 1]) {
      const x = px * side;
      // Uneven chunk heights, summing to the pillar's height.
      const cuts = Array.from({ length: CHUNKS_PER_PILLAR }, () => 0.6 + r());
      const total = cuts.reduce((a, b) => a + b, 0);
      const cut = 2 + Math.floor(r() * (CHUNKS_PER_PILLAR - 3));
      let y = 0;
      cuts.forEach((c, k) => {
        const hi = (c / total) * h;
        const g = thrown([x, y + hi / 2, pz], [w, hi, w * 0.82], 1.5 + r() * 4.5, 3.2);
        g.crack = k >= cut ? side * (0.16 + r() * 0.14) : 0;
        pillars.push(g);
        y += hi;
      });
    }
  }

  const monolith: Piece[] = [];
  if (counts.monolith > 0) {
    MONOLITH.forEach(([w, h, d, y, z], i) => {
      const k = i === 0 ? counts.monolith : 1;
      const g = thrown([0, i === 0 ? 0.54 + (h * k) / 2 : y, z], [w * k, h * k, d], i === 0 ? 1.5 : 0, i === 0 ? 1 : 0);
      if (i > 0) {
        // The steps stay where they are; only the monolith topples.
        g.fly = [...g.p];
        g.rest = [...g.p];
        g.lie = [0, 0, 0];
        g.spin = [0, 0, 0];
      } else {
        g.rest = [0.4, d / 2 + 0.54, z + 1.2];
        g.lie = [-Math.PI / 2, 0.2, 0];
        g.crack = 0.08;
      }
      monolith.push(g);
    });
  }

  const ring: Piece[] = [];
  if (counts.ring > 0) {
    const R = counts.ring;
    for (let i = 0; i < RING_PIECES; i++) {
      const a = (i / RING_PIECES) * Math.PI * 2;
      const g = thrown([Math.cos(a) * R, 5.3, -3.6 + Math.sin(a) * R], [((Math.PI * 2 * R) / RING_PIECES) * 1.02, 0.045, 0.045], 2 + r() * 5, 2.5);
      g.ry = -a + Math.PI / 2;
      g.rest[1] = 0.03;
      g.lie = [0, r() * Math.PI, 0];
      g.crack = r() < 0.3 ? (r() - 0.5) * 0.5 : 0;
      ring.push(g);
    }
  }

  const shards: Piece[] = [];
  for (let i = 0; i < counts.shards; i++) {
    // Shards gather around the pillars when there are any; otherwise across the stage.
    const near = counts.pillarPairs ? PILLARS[i % counts.pillarPairs]! : null;
    const side = i % 2 ? 1 : -1;
    const bx = near && i < counts.shards * 0.85 ? near[0] * side + (r() - 0.5) * 2.4 : (r() - 0.5) * 9;
    const bz = near && i < counts.shards * 0.85 ? near[1] + (r() - 0.5) * 2.4 : -5.6 + r() * 5;
    const size = 0.05 + r() * r() * 0.3;
    const g = thrown([bx, 0.6 + r() * 6, bz], [size, size * (0.6 + r() * 1.4), size * (0.6 + r())], 2 + r() * 7, 3);
    g.ry = r() * Math.PI;
    g.rest[1] = size * 0.4;
    g.lie = [r() * Math.PI, r() * Math.PI, r() * Math.PI];
    shards.push(g);
  }

  const dots: Built["dots"] = [];
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    const a = r() * Math.PI * 2;
    const far = 2 + r() * 5;
    dots.push({ fly: [Math.cos(a) * far, 1 + r() * 5, Math.sin(a) * far * 0.6], rest: [(r() - 0.5) * 0.8, (r() - 0.5) * 1.2], phase: r() });
  }

  const strings: Built["strings"] = [];
  const curtain = 3 + 4 * setAmount(set, "strings");
  for (let i = 0; i < counts.strings; i++) {
    // A dense curtain behind the monolith, and sparse long lines across the back.
    const inCurtain = i < counts.strings * 0.7;
    const x = inCurtain ? (r() - 0.5) * curtain : (r() < 0.5 ? -1 : 1) * (2.6 + r() * 7);
    strings.push({ x, z: inCurtain ? -7.3 - r() * 0.4 : -8.5 - r() * 2, phase: r(), bright: inCurtain ? 0.35 + 0.65 * r() * r() : 0.5 + 0.5 * r() });
  }

  const emitters: Built["emitters"] = [];
  for (let i = 0; i < counts.emitters; i++) {
    const x = counts.emitters === 1 ? 0 : -5 + (10 * i) / (counts.emitters - 1);
    emitters.push({ x, phase: r() });
  }

  const out = { counts, pillars, monolith, ring, shards, dots, strings, emitters };
  cache.set(key, out);
  return out;
}

interface Forces {
  sway: number;
  crack: number;
  burst: number;
  rest: number;
  gone: number;
  float: number;
  beat: number;
  progress: number;
  energy: number;
  motion: number;
}

function place(list: Piece[], out: Pieces, F: Forces, floating: boolean): void {
  out.count = list.length;
  for (let i = 0; i < list.length; i++) {
    const g = list[i]!;
    const k = i * 3;
    let [x, y, z] = g.p;
    let rx = 0, ry = g.ry, rz = 0;
    // Loss of control: pieces hover and tilt a little, slowly.
    if (F.sway > 0) {
      y += Math.sin(F.beat * 0.22 + g.phase * 6.28) * 0.06 * F.sway * F.motion;
      rz += Math.sin(F.beat * 0.17 + g.phase * 9) * 0.03 * F.sway * F.motion;
    }
    // Fracture: everything above the cut slides sideways and leans.
    if (F.crack > 0 && g.crack !== 0) {
      x += g.crack * F.crack;
      rz -= Math.sign(g.crack) * 0.12 * F.crack;
      y += 0.04 * F.crack;
    }
    // Burst: thrown outward and upward, tumbling; later pieces leave a little later.
    if (F.burst > 0) {
      const t = F.burst * smoothstep(clamp(F.progress * 2.6 - g.phase * 0.5)) * (0.45 + 0.55 * F.energy);
      x = lerp(x, g.fly[0], t);
      y = lerp(y, g.fly[1], t);
      z = lerp(z, g.fly[2], t);
      rx += g.spin[0] * t;
      ry += g.spin[1] * t;
      rz += g.spin[2] * t;
    }
    // At rest on the floor.
    if (F.rest > 0) {
      x = lerp(x, g.rest[0], F.rest);
      y = lerp(y, g.rest[1], F.rest);
      z = lerp(z, g.rest[2], F.rest);
      rx = lerp(rx, g.lie[0], F.rest);
      ry = lerp(ry, g.lie[1], F.rest);
      rz = lerp(rz, g.lie[2], F.rest);
    }
    let vis = 1 - F.gone;
    if (floating) {
      // Shards exist only while the set is breaking or broken.
      vis *= clamp(F.float + F.burst + F.rest);
      // Lifted shards drift upward and turn slowly; each one wraps back to the floor.
      const lift = F.float * (1 - F.burst) * (1 - F.rest);
      if (lift > 0) {
        y = lerp(y, 0.3 + ((g.p[1] + F.beat * 0.03 * (0.4 + g.phase) * F.motion) % 6.5), lift);
        rx += F.beat * 0.01 * g.spin[0] * lift * F.motion;
        ry += F.beat * 0.01 * g.spin[1] * lift * F.motion;
      }
      // Only some shards lift at low energy.
      vis *= clamp((F.float * (0.3 + 0.7 * F.energy) + F.burst + F.rest - g.phase * 0.7) * 3);
    }
    out.position[k] = x;
    out.position[k + 1] = y;
    out.position[k + 2] = z;
    out.rotation[k] = rx;
    out.rotation[k + 1] = ry;
    out.rotation[k + 2] = rz;
    out.scale[k] = g.s[0] * vis;
    out.scale[k + 1] = g.s[1] * vis;
    out.scale[k + 2] = g.s[2] * vis;
  }
}

/** A stable 0..1 hash for screen patterns. */
const hash = (a: number, b: number, c: number) => {
  const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
  return s - Math.floor(s);
};

/**
 * Fill `out` for this frame. Deterministic for (frame, seed, set, words).
 * A score made before stage sets existed gets DEFAULT_SET.
 */
export function computeSet(
  frame: StageFrame,
  seed: number,
  set: StageSet = DEFAULT_SET,
  out: SetScene = createSetScene(),
  reducedMotion = false,
  look: Look = lookFor(frame),
  words: Words = []
): SetScene {
  const L = look;
  const B = build(seed, set);
  const C = B.counts;
  const motion = reducedMotion ? 0.15 : 1;
  const ease = smoothstep(frame.progress);
  const chaos = 1 - frame.geometry.order;
  const beat = frame.beat;
  const F: Forces = {
    sway: clamp(L.lift * (0.4 + frame.energy) + L.current + L.split * 0.5 + chaos * 0.5),
    // The crack stays open through the burst.
    crack: Math.max(L.split * ease, L.burst),
    burst: L.burst,
    rest: Math.max(L.sink, L.gather),
    gone: smoothstep(clamp(L.gather * 1.15)),
    float: clamp(L.lift * (0.3 + frame.energy) + L.current + L.split),
    beat,
    progress: frame.progress,
    energy: frame.energy,
    motion
  };
  out.floor = set.floor;
  place(B.pillars, out.pillars, F, false);
  place(B.monolith, out.monolith, F, false);
  place(B.ring, out.ring, F, false);
  place(B.shards, out.shards, F, true);

  // The section's name, held by ordered sections and broken by the rest, like the set around it.
  const wordTo = words[frame.sectionIndex] ?? null;
  const wordFrom = frame.look.mix < 1 ? (words[frame.sectionIndex - 1] ?? null) : wordTo;
  const hold = C.words > 0 ? smoothstep(clamp((L.word * (0.6 + 0.4 * frame.geometry.order) - 0.3) / 0.5)) : 0;
  const wordMix = wordFrom === wordTo ? 1 : frame.look.mix;
  const W = out.words;
  W.count = wordFrom || wordTo ? ELEMENT_COUNT : 0;
  for (let i = 0; i < W.count; i++) {
    const src = (wordFrom ?? wordTo)!;
    const dst = (wordTo ?? wordFrom)!;
    const d = B.dots[i]!;
    const k = i * 3;
    const present = wordFrom && wordTo ? 1 : wordTo ? wordMix : 1 - wordMix;
    let x = lerp(src.xy[i * 2]!, dst.xy[i * 2]!, wordMix) * C.words;
    let y = 0.3 + (lerp(src.xy[i * 2 + 1]!, dst.xy[i * 2 + 1]!, wordMix) - 0.3) * C.words;
    let z = 0;
    const side = x >= 0 ? 1 : -1;
    x += side * F.crack * 0.35;
    y += Math.sin(beat * 0.2 + d.phase * 6.28) * 0.05 * F.sway * motion;
    const t = F.burst * smoothstep(clamp(frame.progress * 2.6 - d.phase * 0.5)) * (0.45 + 0.55 * frame.energy);
    x = lerp(x, x + d.fly[0], t);
    y = lerp(y, y + d.fly[1] * 0.5, t);
    z = lerp(z, d.fly[2], t);
    x = lerp(x, x * 1.1 + d.rest[0], F.rest);
    y = lerp(y, 0.03, F.rest);
    z = lerp(z, d.rest[1], F.rest);
    const dot = lerp(src.dot, dst.dot, wordMix) * C.words;
    const vis = present * (1 - F.gone);
    W.position[k] = x;
    W.position[k + 1] = y;
    W.position[k + 2] = z;
    W.rotation[k] = lerp(0, -Math.PI / 2, F.rest);
    W.rotation[k + 1] = 0;
    W.rotation[k + 2] = t * (d.phase - 0.5) * 6;
    W.scale[k] = dot * vis;
    W.scale[k + 1] = dot * vis;
    W.scale[k + 2] = dot * vis;
  }
  out.wordLight = hold * (0.55 + 0.45 * frame.intensity);

  // Strings: straight in order, swaying as control is lost, cut by the burst.
  const wave = (L.lift * (0.3 + frame.energy) + L.current + L.split * 0.5 + L.burst * 0.8 + chaos * 0.3) * 0.32 * motion;
  const S = out.strings;
  let v = 0;
  S.count = B.strings.length * STRING_SEGMENTS;
  B.strings.forEach((g, i) => {
    const cut = L.burst * smoothstep(clamp(frame.progress * 3 - g.phase * 2));
    const bright = g.bright * (1 - F.gone) * (1 - 0.85 * cut) * (1 - 0.6 * L.sink);
    for (let j = 0; j < STRING_SEGMENTS; j++) {
      for (const e of [j, j + 1]) {
        const y = (e / STRING_SEGMENTS) * STRING_TOP;
        const dx = Math.sin(y * 0.55 + beat * 0.28 + g.phase * 6.28) * wave * (0.3 + y / STRING_TOP);
        S.vertices[v++] = g.x + dx;
        S.vertices[v++] = y;
        S.vertices[v++] = g.z;
      }
      S.light[i * STRING_SEGMENTS + j] = bright;
    }
  });

  // Lasers: a still, narrow fan in order; it opens as energy builds, tilts when the
  // stage breaks, sweeps the hall at the climax, sinks to the floor and goes out.
  const Z = out.lasers;
  Z.count = B.emitters.length * LASERS_PER_EMITTER;
  const open = clamp(0.2 + 0.8 * L.lift * ease + L.burst + 0.6 * L.current + 0.6 * L.split);
  const sweepAmp = (0.15 * L.lift + 0.55 * L.burst + 0.4 * L.current + 0.2 * L.split) * motion;
  const elevation = lerp(lerp(1.25, 0.4, L.burst + 0.4 * L.split), -0.05, L.sink);
  const laserLight = (0.35 + 0.65 * frame.energy) * (1 - F.gone) * (1 - 0.7 * L.sink);
  v = 0;
  B.emitters.forEach((em, e) => {
    const sweep = Math.sin(beat * (0.1 + 0.18 * L.burst) + em.phase * 6.28) * sweepAmp;
    for (let j = 0; j < LASERS_PER_EMITTER; j++) {
      const u = j / (LASERS_PER_EMITTER - 1) - 0.5;
      // Fracture tilts each emitter's fan to its own side.
      const tilt = L.split * ease * (em.x >= 0 ? 0.5 : -0.5);
      const az = u * open * 1.6 + sweep + tilt + em.x * 0.02;
      const el = elevation + Math.abs(u) * 0.15 * (1 - L.sink);
      const dx = Math.sin(az) * Math.cos(el), dy = Math.sin(el), dz = Math.cos(az) * Math.cos(el);
      const x0 = em.x, y0 = 0.25, z0 = -8.2;
      Z.vertices[v++] = x0;
      Z.vertices[v++] = y0;
      Z.vertices[v++] = z0;
      Z.vertices[v++] = x0 + dx * LASER_LENGTH;
      Z.vertices[v++] = Math.max(0.02, y0 + dy * LASER_LENGTH);
      Z.vertices[v++] = z0 + dz * LASER_LENGTH;
      // In a fracture some lines go out, chosen afresh every two beats.
      const dark = L.split * (hash(e, j, Math.floor(beat / 2)) < 0.35 ? 1 : 0);
      Z.light[e * LASERS_PER_EMITTER + j] = laserLight * (1 - 0.9 * dark);
    }
  });

  // LED panels across the back wall, each a 16x10 grid of cells with a pattern per section type.
  out.panelCount = C.panels;
  const PW = 2.4, PH = 1.5, GAP = 0.25;
  const span = C.panels * PW + (C.panels - 1) * GAP;
  const step = Math.floor(beat / 2);
  const cells = out.cells;
  for (let p = 0; p < C.panels; p++) {
    const px = -span / 2 + PW / 2 + p * (PW + GAP);
    // Fracture shears the wall: right-hand panels slip down.
    const slip = L.split * ease * (px > 0 ? -0.35 : 0.12) + F.burst * (hash(p, 1, 0) - 0.5) * 0.8;
    out.panels.set([px, 3.9 + slip, SCREEN_Z, PW, PH], p * 5);
    for (let r = 0; r < SCREEN_ROWS; r++) {
      for (let c = 0; c < SCREEN_COLS; c++) {
        const col = p * SCREEN_COLS + c;
        const mid = Math.abs(r - (SCREEN_ROWS - 1) / 2) < 0.6 ? 1 : 0;
        const order = 0.12 + 0.75 * mid;
        const bar = SCREEN_ROWS * ease * (0.35 + 0.65 * hash(col, 3, step));
        const build = r < bar ? 0.35 + 0.65 * (r / SCREEN_ROWS) : 0.04;
        const glitch = hash(col >> 2, r >> 1, step + p) > 0.55 ? 1 : 0.06;
        const cx = (col - (C.panels * SCREEN_COLS) / 2) / SCREEN_COLS, cy = (r - SCREEN_ROWS / 2) / SCREEN_ROWS;
        const flare = (0.4 + 0.6 * frame.energy) * clamp(1.2 - Math.hypot(cx * 0.5, cy) * (1.6 - frame.energy));
        const sink = r < SCREEN_ROWS * (1 - ease) * 0.5 ? 0.3 : 0.02;
        const drift = 0.25 + 0.35 * Math.sin(col * 0.35 + r * 0.3 - beat * 0.15 * motion);
        cells[(p * SCREEN_ROWS + r) * SCREEN_COLS + c] =
          L.breathe * order + L.lift * build + L.split * glitch + L.burst * flare + L.sink * sink + L.current * drift;
      }
    }
  }

  // Beams from above: one, three or five. In silence only the centre one is left.
  out.beamCount = C.beams;
  const centre = 0.55 + 0.45 * L.gather + 0.3 * L.burst * frame.energy;
  for (let b = 0; b < C.beams; b++) {
    const slot = b === 0 ? 0 : Math.ceil(b / 2) * (b % 2 ? 1 : -1);
    const top = slot * 2.6 + (b === 0 ? L.keyX * 0.3 : 0);
    const foot = slot * 1.6 + L.split * ease * slot * 0.4;
    out.beams.set([top, foot, b === 0 ? centre : centre * 0.6 * (1 - F.gone)], b * 3);
  }

  // Light and colour.
  const [kr, kg, kb] = frame.keyColor;
  const [ar, ag, ab] = frame.accentColor;
  const hot = clamp(0.35 * L.lift + 0.3 * L.current + L.split + L.burst);
  out.energyColor = [lerp(kr, ar, hot), lerp(kg, ag, hot), lerp(kb, ab, hot)];
  out.energy = clamp(L.lift * (0.25 + frame.energy) + L.current * 0.7 + L.split * (0.5 + 0.5 * frame.energy) + L.burst * (0.6 + 0.4 * frame.energy)) * (1 - F.gone);
  out.light = (1 - frame.blackout) * (0.35 + 0.65 * frame.intensity);
  out.ringLight = 1 - F.gone;
  out.haze = C.haze * clamp(0.35 + 0.3 * L.haze + 0.4 * F.burst * frame.energy) * (1 - 0.8 * F.gone);
  out.backGlow = clamp(L.split * 0.35 + L.burst * (0.3 + 0.6 * frame.energy) + L.lift * 0.15 * frame.energy) * (1 - F.gone);
  return out;
}

/**
 * The camera's vertical field of view and how far to raise its aim, for a stage
 * of this aspect ratio. A portrait phone sees too little of a set built wide,
 * so its view widens (up to 75°) until about 45° across is visible, and looks a
 * little higher so the pillars and the ring stay in frame.
 */
export function framing(aspect: number, fov: number): { fov: number; lift: number } {
  const wide = (2 * Math.atan(0.42 / Math.max(0.2, aspect)) * 180) / Math.PI;
  const f = Math.max(fov, Math.min(75, wide));
  return { fov: f, lift: 1.4 * clamp((f - fov) / 30) };
}
