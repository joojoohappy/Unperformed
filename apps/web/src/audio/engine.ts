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

  for (const s of score.sections) {
    if (s.startBeat + s.lengthBeats <= fromBeat) continue;
    const root = midiToHz(score.rootNote + s.sound.pitch);
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
