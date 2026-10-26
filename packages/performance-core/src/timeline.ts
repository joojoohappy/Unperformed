/**
 * Timeline sampler: (score, beat) -> StageFrame.
 *
 * A pure function. The renderer calls it every animation frame with the beat
 * derived from the audio clock; rehearsal scrubbing calls it with any beat.
 * Because it holds no state, playback, scrubbing and replay always agree, and
 * the same score always renders the same performance.
 */
import { MAX_FLICKER_HZ, type GeometryForm, type PerformanceScore, type Section } from "./schema";
import { type RGB, clamp, hexToRgb, lerp, mixRgb, noise1, smoothstep } from "./util";

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

export interface StageFrame {
  beat: number;
  seconds: number;
  sectionIndex: number;
  sectionId: string;
  /** 0..1 progress through the current section. */
  progress: number;
  energy: number;
  /** Final light intensity after release logic, transitions and flicker. */
  intensity: number;
  keyColor: RGB;
  accentColor: RGB;
  wash: number;
  /** 0 = visible, 1 = fully black (fades, blackouts, end of piece). */
  blackout: number;
  camera: CameraPose;
  geometry: { from: GeometryForm; to: GeometryForm; mix: number; order: number; density: number };
  /** Climax release state, for HUD and audio. */
  release: "none" | "holding" | "released";
  ended: boolean;
}

export interface SampleOptions {
  reducedMotion?: boolean;
  /** Live performance overrides; applied on top of the score without changing timing. */
  masterIntensity?: number;
  forceBlackout?: boolean;
}

const WASH_VALUE = { cold: -1, neutral: 0, warm: 1 } as const;

function curve(kind: Section["energy"]["curve"], p: number): number {
  switch (kind) {
    case "ease-in":
      return p * p;
    case "ease-out":
      return 1 - (1 - p) * (1 - p);
    case "step":
      return p < 0.5 ? 0 : 1;
    default:
      return p;
  }
}

export function sectionAt(score: PerformanceScore, beat: number): number {
  const b = clamp(beat, 0, score.totalBeats - 1e-6);
  for (let i = score.sections.length - 1; i >= 0; i--) if (b >= score.sections[i]!.startBeat) return i;
  return 0;
}

function poseFor(section: Section, localBeats: number, seed: number, reducedMotion: boolean): CameraPose {
  const p = clamp(localBeats / section.lengthBeats);
  const speed = reducedMotion ? section.camera.speed * 0.25 : section.camera.speed;
  const base: CameraPose = { position: [0, 1.4, 9.5], target: [0, 1.1, 0], fov: 42 };
  switch (section.camera.move) {
    case "push-in":
      base.position = [0, 1.4, 10.5 - 4.5 * speed * p];
      break;
    case "pull-back":
      base.position = [0, 1.6 + 0.8 * speed * p, 6.5 + 6 * speed * p];
      break;
    case "orbit": {
      const a = -0.5 + speed * localBeats * 0.035;
      base.position = [Math.sin(a) * 9, 1.6 + Math.sin(a * 0.5) * 0.6, Math.cos(a) * 9];
      break;
    }
    case "drift":
      base.position = [Math.sin(localBeats * 0.05 * (0.5 + speed)) * 2.2, 1.5 + Math.cos(localBeats * 0.04) * 0.3, 9];
      break;
    case "tremor": {
      const amp = reducedMotion ? 0 : 0.12 * speed;
      base.position = [noise1(seed, localBeats * 1.7) * amp, 1.4 + noise1(seed + 7, localBeats * 1.9) * amp, 8.5 - p * 1.5];
      break;
    }
    case "static":
      break;
  }
  return base;
}

function lerpPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  const v = (x: [number, number, number], y: [number, number, number]): [number, number, number] => [
    lerp(x[0], y[0], t),
    lerp(x[1], y[1], t),
    lerp(x[2], y[2], t)
  ];
  return { position: v(a.position, b.position), target: v(a.target, b.target), fov: lerp(a.fov, b.fov, t) };
}

/** Section energy at a local position, including the climax release shape. */
function sectionEnergy(s: Section, local: number): { energy: number; release: StageFrame["release"]; burst: number } {
  const p = clamp(local / s.lengthBeats);
  let energy = lerp(s.energy.from, s.energy.to, curve(s.energy.curve, p));
  if (!s.release) return { energy, release: "none", burst: 0 };
  const hold = s.release.holdBeats;
  if (s.release.mode === "held" && local < hold) {
    // Held breath: pull everything back before the release.
    return { energy: Math.min(energy, 0.22), release: "holding", burst: 0 };
  }
  if (s.release.mode === "staggered" && local < hold) {
    return { energy: lerp(0.4, 1, smoothstep(local / Math.max(1, hold))), release: "holding", burst: 0 };
  }
  const sinceRelease = local - (s.release.mode === "immediate" ? 0 : hold);
  const burst = Math.exp(-sinceRelease / 6);
  energy = Math.max(energy, lerp(energy, 1, burst));
  return { energy, release: "released", burst };
}

const ORDER_BEFORE_FIRST = 1;

export function sample(score: PerformanceScore, beat: number, opts: SampleOptions = {}): StageFrame {
  const reducedMotion = !!opts.reducedMotion;
  const spb = 60 / score.tempoBpm;
  const ended = beat >= score.totalBeats;
  const b = clamp(beat, 0, score.totalBeats - 1e-6);
  const idx = sectionAt(score, b);
  const s = score.sections[idx]!;
  const prev = score.sections[idx - 1];
  const local = b - s.startBeat;
  const progress = clamp(local / s.lengthBeats);

  const { energy, release, burst } = sectionEnergy(s, local);

  // Geometry order/density travel from the previous section's values to this one's.
  const prevOrder = prev ? prev.geometry.order : ORDER_BEFORE_FIRST;
  const prevDensity = prev ? prev.geometry.density : s.geometry.density;
  const travel = smoothstep(progress);
  let order = lerp(prevOrder, s.geometry.order, travel);
  if (release === "holding" && s.release?.mode === "held") order = Math.max(order, 0.7); // contract before release
  const density = lerp(prevDensity, s.geometry.density, travel);

  // Transition into this section.
  const tBeats = s.transition.beats;
  const tp = tBeats > 0 ? clamp(local / tBeats) : 1;
  let blackout = 0;
  let formMix = 1;
  if (s.transition.type === "blackout") blackout = 1 - smoothstep(tp);
  else if (s.transition.type === "fade" && (!prev || s.archetype === "silence")) blackout = idx === 0 ? 1 - smoothstep(tp) : 0;
  if (s.transition.type === "dissolve" || s.transition.type === "fade") formMix = smoothstep(tp);

  // Light.
  let intensity = s.lighting.intensity * lerp(0.35, 1, energy);
  if (release === "holding" && s.release?.mode === "held") intensity = Math.min(intensity, 0.14);
  if (release === "released") intensity = clamp(intensity + burst * 0.35);
  if (s.transition.type === "fade" && prev && tBeats > 0) {
    intensity = lerp(prev.lighting.intensity * 0.6, intensity, smoothstep(tp));
  }
  // Slow modulation, frequency hard-capped for photosensitive safety; disabled for reduced motion.
  if (!reducedMotion && s.lighting.flicker > 0) {
    const seconds = b * spb;
    const hz = Math.min(MAX_FLICKER_HZ, 0.4 + energy * 1.1);
    const mod = 0.5 + 0.5 * Math.sin(seconds * hz * Math.PI * 2);
    intensity *= 1 - Math.min(0.3, s.lighting.flicker * 0.35) * mod;
  }
  intensity *= opts.masterIntensity ?? 1;
  if (opts.forceBlackout) blackout = 1;

  // Colour: key moves from the previous section's key during the transition.
  const key = hexToRgb(s.lighting.key);
  const keyColor = prev && tBeats > 0 ? mixRgb(hexToRgb(prev.lighting.key), key, smoothstep(tp)) : key;

  // Camera: blend from where the previous section left off, except on cuts.
  let camera = poseFor(s, local, score.seed + idx, reducedMotion);
  if (prev && s.transition.type !== "cut" && tBeats > 0 && tp < 1) {
    camera = lerpPose(poseFor(prev, prev.lengthBeats, score.seed + idx - 1, reducedMotion), camera, smoothstep(tp));
  }

  // The end of the piece fades to black over the final 2 beats.
  const tail = score.totalBeats - b;
  if (tail < 2) blackout = Math.max(blackout, 1 - tail / 2);
  if (ended) blackout = 1;

  return {
    beat: b,
    seconds: b * spb,
    sectionIndex: idx,
    sectionId: s.id,
    progress,
    energy: clamp(energy),
    intensity: clamp(intensity),
    keyColor,
    accentColor: hexToRgb(s.lighting.accent),
    wash: WASH_VALUE[s.lighting.wash],
    blackout: clamp(blackout),
    camera,
    geometry: { from: prev && formMix < 1 ? prev.geometry.form : s.geometry.form, to: s.geometry.form, mix: formMix, order: clamp(order), density: clamp(density) },
    release,
    ended
  };
}

/** Sample the whole score at a fixed frame rate. Used for tests, replay checks and benchmarks. */
export function sampleRange(score: PerformanceScore, fps: number, opts: SampleOptions = {}): StageFrame[] {
  const spb = 60 / score.tempoBpm;
  const frames: StageFrame[] = [];
  const total = score.totalBeats * spb;
  for (let f = 0; f * (1 / fps) < total; f++) frames.push(sample(score, (f / fps) / spb, opts));
  return frames;
}

/** A compact fingerprint of a rendered timeline, for deterministic replay checks. */
export function timelineFingerprint(score: PerformanceScore, fps = 10): string {
  let h = 0x811c9dc5;
  for (const f of sampleRange(score, fps)) {
    const parts = [f.sectionIndex, f.intensity, f.energy, f.blackout, ...f.camera.position, f.geometry.order, f.geometry.density, ...f.keyColor];
    for (const p of parts) {
      const v = typeof p === "number" ? Math.round(p * 1e4) : 0;
      h ^= v;
      h = Math.imul(h, 0x01000193);
    }
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}
