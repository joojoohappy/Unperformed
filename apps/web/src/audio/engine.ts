/**
 * Procedural sound for a Performance Score. Original synthesis, no samples.
 *
 * `scheduleScore` writes the whole piece (from a start beat) onto any
 * BaseAudioContext, so the same code drives live playback and offline
 * rendering (used to put the real soundtrack on the demo video).
 * The AudioContext clock is the master clock for live playback: visuals read
 * the current beat from it, so sound and image cannot drift apart.
 */
import type { PerformanceScore, Section } from "@unperformed/performance-core";
import { rng } from "@unperformed/performance-core";

const midiToHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

function noiseBuffer(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * seconds)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  const r = rng(seed);
  for (let i = 0; i < data.length; i++) data[i] = r() * 2 - 1;
  return buf;
}

function impulse(ctx: BaseAudioContext, seconds: number, seed: number): AudioBuffer {
  const len = Math.floor(ctx.sampleRate * seconds);
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  const r = rng(seed);
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (r() * 2 - 1) * (1 - i / len) ** 3;
  }
  return buf;
}

interface Bus {
  dry: AudioNode;
  wet: AudioNode;
}

/** Envelope helper: section-level gain following the energy shape, with the climax hold. */
function sectionGain(ctx: BaseAudioContext, s: Section, t0: number, spb: number, level: number, from: number): GainNode {
  const g = ctx.createGain();
  const start = t0 + Math.max(0, s.startBeat - from) * spb;
  const end = t0 + (s.startBeat + s.lengthBeats - from) * spb;
  const e = (x: number) => Math.max(0.0001, level * (0.25 + 0.75 * x));
  g.gain.setValueAtTime(0.0001, start);
  g.gain.linearRampToValueAtTime(e(s.energy.from), start + Math.min(1.5, (end - start) / 4));
  if (s.release && s.release.mode !== "immediate" && s.release.holdBeats > 0) {
    const holdEnd = t0 + (s.startBeat + s.release.holdBeats - from) * spb;
    if (s.release.mode === "held") g.gain.linearRampToValueAtTime(0.0001, Math.max(start + 0.05, holdEnd - 0.05));
    g.gain.setValueAtTime(s.release.mode === "held" ? 0.0001 : e(0.4), Math.max(start + 0.06, holdEnd - 0.04));
    g.gain.linearRampToValueAtTime(e(1), holdEnd + 0.05);
  }
  g.gain.linearRampToValueAtTime(e(s.energy.to), Math.max(start + 0.1, end - 0.3));
  g.gain.linearRampToValueAtTime(0.0001, end + 0.4);
  return g;
}

function drone(ctx: BaseAudioContext, bus: Bus, s: Section, freq: number, t0: number, spb: number, from: number, bright: number) {
  const start = t0 + Math.max(0, s.startBeat - from) * spb;
  const end = t0 + (s.startBeat + s.lengthBeats - from) * spb + 0.5;
  const g = sectionGain(ctx, s, t0, spb, s.sound.level * 0.16, from);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(300 + bright * 2400 * s.energy.from, start);
  filter.frequency.linearRampToValueAtTime(300 + bright * 2400 * s.energy.to, end);
  filter.Q.value = 0.7;
  for (const [type, mult, detune] of [
    ["sawtooth", 1, -7],
    ["sine", 0.5, 0],
    ["triangle", 1.5, 5]
  ] as const) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq * mult;
    o.detune.value = detune;
    o.connect(filter);
    o.start(start);
    o.stop(end);
  }
  filter.connect(g);
  g.connect(bus.dry);
  g.connect(bus.wet);
}

function pulses(ctx: BaseAudioContext, bus: Bus, s: Section, freq: number, t0: number, spb: number, from: number) {
  const every = s.sound.pulseEvery;
  const firstBeat = Math.max(s.startBeat, Math.ceil(from / every) * every);
  for (let b = firstBeat; b < s.startBeat + s.lengthBeats; b += every) {
    const local = b - s.startBeat;
    if (s.release && s.release.mode === "held" && local < s.release.holdBeats) continue; // held breath
    const p = local / s.lengthBeats;
    const energy = s.energy.from + (s.energy.to - s.energy.from) * p;
    const t = t0 + (b - from) * spb;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(freq * 2, t);
    o.frequency.exponentialRampToValueAtTime(freq, t + 0.12);
    const g = ctx.createGain();
    const peak = Math.max(0.0002, s.sound.level * 0.22 * (0.35 + 0.65 * energy));
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    o.connect(g);
    g.connect(bus.dry);
    g.connect(bus.wet);
    o.start(t);
    o.stop(t + 0.4);
  }
}

function noiseBed(ctx: BaseAudioContext, bus: Bus, s: Section, noise: AudioBuffer, t0: number, spb: number, from: number) {
  const start = t0 + Math.max(0, s.startBeat - from) * spb;
  const end = t0 + (s.startBeat + s.lengthBeats - from) * spb + 0.5;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.loop = true;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(400, start);
  bp.frequency.exponentialRampToValueAtTime(2600, end);
  bp.Q.value = 0.9;
  const g = sectionGain(ctx, s, t0, spb, s.sound.level * 0.12, from);
  src.connect(bp);
  bp.connect(g);
  g.connect(bus.dry);
  g.connect(bus.wet);
  src.start(start);
  src.stop(end);
}

function hit(ctx: BaseAudioContext, bus: Bus, noise: AudioBuffer, t: number, level: number) {
  const o = ctx.createOscillator();
  o.type = "sine";
  o.frequency.setValueAtTime(120, t);
  o.frequency.exponentialRampToValueAtTime(38, t + 0.6);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.55 * level, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
  o.connect(g);
  g.connect(bus.dry);
  o.start(t);
  o.stop(t + 2.3);
  const n = ctx.createBufferSource();
  n.buffer = noise;
  const ng = ctx.createGain();
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(6000, t);
  lp.frequency.exponentialRampToValueAtTime(300, t + 2.5);
  ng.gain.setValueAtTime(0.0001, t);
  ng.gain.exponentialRampToValueAtTime(0.25 * level, t + 0.01);
  ng.gain.exponentialRampToValueAtTime(0.0001, t + 2.8);
  n.connect(lp);
  lp.connect(ng);
  ng.connect(bus.wet);
  ng.connect(bus.dry);
  n.start(t);
  n.stop(t + 3);
}

// ---------------------------------------------------------------- section-type voices
// Each section type adds its own voice on top of the texture above, so order,
// build, fracture, climax, release, silence and drift sound different even
// with the same texture. Everything is seeded: the same score always sounds the same.

interface Span {
  start: number;
  end: number;
  /** Context time of a beat in the score. */
  at: (beat: number) => number;
  /** First beat at or after both `fromBeat` and the section start. */
  first: number;
  last: number;
  /** Section-level gain node following the energy shape. */
  gain: (level: number) => GainNode;
}

function span(ctx: BaseAudioContext, s: Section, t0: number, spb: number, from: number): Span {
  return {
    start: t0 + Math.max(0, s.startBeat - from) * spb,
    end: t0 + (s.startBeat + s.lengthBeats - from) * spb,
    at: (b) => t0 + (b - from) * spb,
    first: Math.max(s.startBeat, from),
    last: s.startBeat + s.lengthBeats,
    gain: (level) => sectionGain(ctx, s, t0, spb, level, from)
  };
}

function pan(ctx: BaseAudioContext, value: number): StereoPannerNode {
  const p = ctx.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, value));
  return p;
}

/** A short percussive envelope into the bus. */
function blip(ctx: BaseAudioContext, bus: Bus, src: AudioScheduledSourceNode & AudioNode, t: number, peak: number, decay: number, panTo: number, filter?: BiquadFilterNode) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
  const p = pan(ctx, panTo);
  if (filter) {
    src.connect(filter);
    filter.connect(g);
  } else src.connect(g);
  g.connect(p);
  p.connect(bus.dry);
  p.connect(bus.wet);
  src.start(t);
  src.stop(t + decay + 0.05);
}

/** Two-operator FM bell: bright attack, long inharmonic decay. */
function bell(ctx: BaseAudioContext, bus: Bus, freq: number, t: number, peak: number, decay: number, panTo: number) {
  const car = ctx.createOscillator();
  car.frequency.value = freq;
  const mod = ctx.createOscillator();
  mod.frequency.value = freq * 3.5;
  const idx = ctx.createGain();
  idx.gain.setValueAtTime(freq * 2.2, t);
  idx.gain.exponentialRampToValueAtTime(Math.max(1, freq * 0.05), t + decay * 0.6);
  mod.connect(idx);
  idx.connect(car.frequency);
  mod.start(t);
  mod.stop(t + decay + 0.05);
  blip(ctx, bus, car, t, peak, decay, panTo);
}

/** Order: a clock. Soft ticks on every beat, alternating sides, over an open fifth. */
function orderVoice(ctx: BaseAudioContext, bus: Bus, s: Section, root: number, noise: AudioBuffer, sp: Span) {
  const lvl = s.sound.level;
  for (let b = Math.ceil(sp.first); b < sp.last; b++) {
    const n = ctx.createBufferSource();
    n.buffer = noise;
    const hp = ctx.createBiquadFilter();
    hp.type = "bandpass";
    hp.frequency.value = (b - s.startBeat) % 4 === 0 ? 3200 : 5200;
    hp.Q.value = 6;
    blip(ctx, bus, n, sp.at(b), lvl * ((b - s.startBeat) % 4 === 0 ? 0.6 : 0.35), 0.05, b % 2 ? 0.45 : -0.45, hp);
  }
  const g = sp.gain(lvl * 0.12);
  for (const [mult, side] of [[1.5, -0.3], [2, 0.3]] as const) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = root * mult;
    const p = pan(ctx, side);
    o.connect(p);
    p.connect(g);
    o.start(sp.start);
    o.stop(sp.end + 0.5);
  }
  g.connect(bus.dry);
  g.connect(bus.wet);
}

/** Build: an arpeggio that climbs and quickens, a filter that opens, and a riser into the next section. */
function buildVoice(ctx: BaseAudioContext, bus: Bus, s: Section, root: number, noise: AudioBuffer, sp: Span, r: () => number) {
  const steps = [0, 3, 7, 10, 12, 15, 19, 24];
  const lvl = s.sound.level;
  let i = 0;
  for (let b = s.startBeat; b < sp.last; i++) {
    const p = (b - s.startBeat) / s.lengthBeats;
    const step = p < 0.5 ? 1 : p < 0.8 ? 0.5 : 0.25;
    const side = (r() - 0.5) * 0.8;
    if (b >= sp.first) {
      const o = ctx.createOscillator();
      o.type = "triangle";
      o.frequency.value = root * 2 * 2 ** ((steps[i % steps.length]! + 12 * Math.floor(p * 2)) / 12);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 600 + 5000 * p * p;
      blip(ctx, bus, o, sp.at(b), lvl * (0.28 + 0.36 * p), 0.18 + 0.2 * (1 - p), side, lp);
    }
    b += step;
  }
  // Riser over the last quarter.
  const riseStart = Math.max(sp.first, s.startBeat + s.lengthBeats * 0.75);
  if (riseStart < sp.last) {
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 3;
    const t = sp.at(riseStart);
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(7000, sp.end);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(lvl * 0.5, sp.end - 0.02);
    g.gain.linearRampToValueAtTime(0.0001, sp.end + 0.03);
    n.connect(bp);
    bp.connect(g);
    g.connect(bus.dry);
    g.connect(bus.wet);
    n.start(t);
    n.stop(sp.end + 0.1);
  }
}

/** Fracture: seeded glitches on and off the beat, thrown across the stereo field, over a tritone. */
function fractureVoice(ctx: BaseAudioContext, bus: Bus, s: Section, root: number, sp: Span, r: () => number) {
  const lvl = s.sound.level;
  for (let b = s.startBeat; b < sp.last; b += 0.5) {
    const roll = r();
    const where = (r() - 0.5) * 1.8;
    const ratio = 1 + Math.floor(r() * 6);
    if (b < sp.first || roll > 0.45) continue;
    const t = sp.at(b + (roll < 0.1 ? 0.25 : 0));
    const o = ctx.createOscillator();
    o.type = "square";
    o.frequency.value = root * ratio;
    const m = ctx.createOscillator();
    m.frequency.value = root * ratio * 1.414;
    const mg = ctx.createGain();
    mg.gain.value = root * ratio * 3;
    m.connect(mg);
    mg.connect(o.frequency);
    m.start(t);
    m.stop(t + 0.12);
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 800 + 3000 * roll * 2;
    bp.Q.value = 2;
    blip(ctx, bus, o, t, lvl * 0.45, 0.06 + roll * 0.15, where, bp);
  }
  const g = sp.gain(lvl * 0.16);
  for (const [mult, detune, side] of [[1, 0, -0.6], [1.414, 9, 0.6]] as const) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = root * mult;
    o.detune.value = detune;
    const p = pan(ctx, side);
    o.connect(p);
    p.connect(g);
    o.start(sp.start);
    o.stop(sp.end + 0.5);
  }
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 1400;
  g.connect(lp);
  lp.connect(bus.dry);
  lp.connect(bus.wet);
}

/** Climax: a wide detuned stack, a riser through any held breath, and a shimmer after the release. */
function climaxVoice(ctx: BaseAudioContext, bus: Bus, s: Section, root: number, noise: AudioBuffer, sp: Span) {
  const lvl = s.sound.level;
  const g = sp.gain(lvl * 0.17);
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 3200;
  for (let v = 0; v < 5; v++) {
    const o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.value = root * (v === 2 ? 0.5 : 1);
    o.detune.value = (v - 2) * 11;
    const p = pan(ctx, (v - 2) * 0.4);
    o.connect(p);
    p.connect(lp);
    o.start(sp.start);
    o.stop(sp.end + 0.5);
  }
  lp.connect(g);
  g.connect(bus.dry);
  g.connect(bus.wet);
  const hold = s.release && s.release.mode !== "immediate" ? s.release.holdBeats : 0;
  const releaseBeat = s.startBeat + hold;
  if (hold > 0 && releaseBeat > sp.first) {
    // Rising noise through the hold, cut dead at the release.
    const n = ctx.createBufferSource();
    n.buffer = noise;
    n.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 4;
    const t = sp.at(Math.max(sp.first, s.startBeat));
    const tr = sp.at(releaseBeat);
    bp.frequency.setValueAtTime(200, t);
    bp.frequency.exponentialRampToValueAtTime(5000, tr);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(lvl * 0.25, tr - 0.01);
    ng.gain.linearRampToValueAtTime(0.0001, tr + 0.01);
    n.connect(bp);
    bp.connect(ng);
    ng.connect(bus.dry);
    n.start(t);
    n.stop(tr + 0.05);
  }
  if (releaseBeat >= sp.first && releaseBeat < sp.last) {
    // Shimmer: two octaves up, slowly fading through the reverb.
    const t = sp.at(releaseBeat);
    for (const [mult, side] of [[4, -0.5], [6, 0.5], [8, 0]] as const) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = root * mult;
      o.detune.value = side * 6;
      blip(ctx, { dry: bus.wet, wet: bus.wet }, o, t, lvl * 0.1, Math.min(8, sp.end - t + 1), side);
    }
  }
}

/** Release: slow descending bells into a long tail. */
function releaseVoice(ctx: BaseAudioContext, bus: Bus, s: Section, root: number, sp: Span, r: () => number) {
  const scale = [24, 22, 19, 17, 15, 12, 10, 7];
  let i = 0;
  for (let b = s.startBeat; b < sp.last; b += 4, i++) {
    const side = (r() - 0.5) * 1.2;
    if (b < sp.first) continue;
    const p = (b - s.startBeat) / s.lengthBeats;
    bell(ctx, bus, root * 2 ** (scale[i % scale.length]! / 12), sp.at(b), s.sound.level * 0.32 * (1 - 0.6 * p), 3.5, side);
  }
}

/** Silence: not quite nothing. Two faint high tones, far apart, as if from another room. */
function silenceVoice(ctx: BaseAudioContext, bus: Bus, s: Section, root: number, sp: Span, r: () => number) {
  for (const at of [0.2, 0.6]) {
    const b = s.startBeat + s.lengthBeats * (at + r() * 0.2);
    const mult = r() > 0.5 ? 12 : 8;
    const side = (r() - 0.5) * 1.6;
    if (b < sp.first) continue;
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = root * mult;
    blip(ctx, { dry: bus.wet, wet: bus.wet }, o, sp.at(b), s.sound.level * 0.04, 4, side);
  }
}

/** Drift: a slow chorus of sines that wanders between the speakers. */
function driftVoice(ctx: BaseAudioContext, bus: Bus, s: Section, root: number, sp: Span, r: () => number) {
  const g = sp.gain(s.sound.level * 0.14);
  for (const [mult, detune] of [[1, -4], [1.5, 3], [2, 6], [3, -7]] as const) {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = root * mult;
    o.detune.value = detune;
    const p = ctx.createStereoPanner();
    p.pan.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.04 + r() * 0.06;
    const depth = ctx.createGain();
    depth.gain.value = 0.7;
    lfo.connect(depth);
    depth.connect(p.pan);
    o.connect(p);
    p.connect(g);
    for (const n of [o, lfo]) {
      n.start(sp.start);
      n.stop(sp.end + 0.5);
    }
  }
  g.connect(bus.dry);
  g.connect(bus.wet);
}

function sectionVoice(ctx: BaseAudioContext, bus: Bus, s: Section, index: number, root: number, noise: AudioBuffer, seed: number, t0: number, spb: number, from: number) {
  // Explicit silence stays silent, whatever the section type.
  if (s.sound.texture === "silence" || s.sound.level <= 0) return;
  const sp = span(ctx, s, t0, spb, from);
  const r = rng(seed * 31 + index * 977);
  switch (s.archetype) {
    case "order":
      return orderVoice(ctx, bus, s, root, noise, sp);
    case "build":
      return buildVoice(ctx, bus, s, root, noise, sp, r);
    case "fracture":
      return fractureVoice(ctx, bus, s, root, sp, r);
    case "climax":
      return climaxVoice(ctx, bus, s, root, noise, sp);
    case "release":
      return releaseVoice(ctx, bus, s, root, sp, r);
    case "silence":
      return silenceVoice(ctx, bus, s, root, sp, r);
    case "drift":
      return driftVoice(ctx, bus, s, root, sp, r);
  }
}

/**
 * Schedule a score onto `dest`, beginning at `fromBeat` and mapped so that
 * beat `fromBeat` sounds at context time `t0`.
 */
export function scheduleScore(ctx: BaseAudioContext, dest: AudioNode, score: PerformanceScore, fromBeat: number, t0: number): void {
  const spb = 60 / score.tempoBpm;
  const reverb = ctx.createConvolver();
  reverb.buffer = impulse(ctx, 3.2, score.seed);
  const wetGain = ctx.createGain();
  wetGain.gain.value = 0.35;
  reverb.connect(wetGain);
  wetGain.connect(dest);
  const bus: Bus = { dry: dest, wet: reverb };
  const noise = noiseBuffer(ctx, 2, score.seed + 1);

  for (const [index, s] of score.sections.entries()) {
    if (s.startBeat + s.lengthBeats <= fromBeat) continue;
    const root = midiToHz(score.rootNote + s.sound.pitch);
    sectionVoice(ctx, bus, s, index, root, noise, score.seed, t0, spb, fromBeat);
    switch (s.sound.texture) {
      case "drone":
        drone(ctx, bus, s, root, t0, spb, fromBeat, 0.5);
        break;
      case "pulse":
        drone(ctx, bus, s, root / 2, t0, spb, fromBeat, 0.2);
        pulses(ctx, bus, s, root * 2, t0, spb, fromBeat);
        break;
      case "noise":
        drone(ctx, bus, s, root / 2, t0, spb, fromBeat, 0.3);
        noiseBed(ctx, bus, s, noise, t0, spb, fromBeat);
        pulses(ctx, bus, s, root * 2, t0, spb, fromBeat);
        break;
      case "swell":
        drone(ctx, bus, s, root, t0, spb, fromBeat, 1);
        drone(ctx, bus, s, root * 1.5, t0, spb, fromBeat, 0.8);
        pulses(ctx, bus, s, root * 2, t0, spb, fromBeat);
        break;
      case "silence":
        break;
    }
    if (s.release) {
      const releaseBeat = s.startBeat + (s.release.mode === "immediate" ? 0 : s.release.holdBeats);
      if (releaseBeat >= fromBeat) hit(ctx, bus, noise, t0 + (releaseBeat - fromBeat) * spb, s.sound.level);
    }
  }
}

/** Live playback engine. One instance per page. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voice: GainNode | null = null;
  private t0 = 0;
  private fromBeat = 0;
  private spb = 0.5;
  readonly available: boolean;

  constructor() {
    this.available = typeof window !== "undefined" && typeof window.AudioContext !== "undefined";
  }

  private ensure(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ latencyHint: "interactive" });
      const comp = this.ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 4;
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(comp);
      comp.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Start sound for `score` at `fromBeat`. Returns false if audio could not start. */
  async play(score: PerformanceScore, fromBeat: number): Promise<boolean> {
    if (!this.available) return false;
    this.stop();
    const ctx = this.ensure();
    try {
      if (ctx.state !== "running") await ctx.resume();
    } catch {
      return false;
    }
    this.voice = ctx.createGain();
    this.voice.connect(this.master!);
    this.spb = 60 / score.tempoBpm;
    this.fromBeat = fromBeat;
    this.t0 = ctx.currentTime + 0.08;
    scheduleScore(ctx, this.voice, score, fromBeat, this.t0);
    return ctx.state === "running";
  }

  /** Current beat according to the audio clock. */
  beat(): number {
    if (!this.ctx) return this.fromBeat;
    return this.fromBeat + Math.max(0, this.ctx.currentTime - this.t0) / this.spb;
  }

  async pause(): Promise<void> {
    await this.ctx?.suspend();
  }

  async resume(): Promise<void> {
    await this.ctx?.resume();
  }

  setVolume(v: number): void {
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  stop(): void {
    if (this.voice && this.ctx) {
      const v = this.voice;
      v.gain.setTargetAtTime(0, this.ctx.currentTime, 0.03);
      setTimeout(() => v.disconnect(), 200);
    }
    this.voice = null;
  }

  get running(): boolean {
    return this.ctx?.state === "running";
  }
}

/** Render a whole score offline (for media capture). */
export async function renderOffline(score: PerformanceScore, sampleRate = 44100): Promise<AudioBuffer> {
  const seconds = (score.totalBeats * 60) / score.tempoBpm + 3;
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp);
  comp.connect(ctx.destination);
  scheduleScore(ctx, master, score, 0, 0);
  return ctx.startRendering();
}

/** Encode an AudioBuffer as 16-bit PCM WAV. */
export function encodeWav(buf: AudioBuffer): Uint8Array {
  const ch = buf.numberOfChannels;
  const len = buf.length;
  const out = new DataView(new ArrayBuffer(44 + len * ch * 2));
  const w = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
  w(0, "RIFF");
  out.setUint32(4, 36 + len * ch * 2, true);
  w(8, "WAVE");
  w(12, "fmt ");
  out.setUint32(16, 16, true);
  out.setUint16(20, 1, true);
  out.setUint16(22, ch, true);
  out.setUint32(24, buf.sampleRate, true);
  out.setUint32(28, buf.sampleRate * ch * 2, true);
  out.setUint16(32, ch * 2, true);
  out.setUint16(34, 16, true);
  w(36, "data");
  out.setUint32(40, len * ch * 2, true);
  const chans = Array.from({ length: ch }, (_, i) => buf.getChannelData(i));
  let o = 44;
  for (let i = 0; i < len; i++) {
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c]![i]!));
      out.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true);
      o += 2;
    }
  }
  return new Uint8Array(out.buffer);
}
