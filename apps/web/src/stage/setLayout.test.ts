import { compile, DEFAULT_SET, demoInterpret, demoSet, sample, type StageSet } from "@unperformed/performance-core";
import { describe, expect, it } from "vitest";
import { computeSet, createSetScene, framing, setCounts } from "./setLayout";

const { score } = compile(demoInterpret({ intent: "I want a performance that starts with perfect order, gradually collapses into chaos, and ends in complete silence.", locale: "en" }), { durationSec: 75, seed: 3 });
const at = (archetype: string, p = 0.6) => {
  const s = score.sections.find((x) => x.archetype === archetype)!;
  return sample(score, s.startBeat + s.lengthBeats * p);
};
const visible = (scale: Float32Array, count: number) => {
  let n = 0;
  for (let i = 0; i < count; i++) if (scale[i * 3 + 1]! > 1e-4) n++;
  return n;
};

describe("stage set layout", () => {
  it("is deterministic for the same frame, seed and set", () => {
    const f = at("fracture");
    const a = computeSet(f, 7, score.set, createSetScene());
    const b = computeSet(f, 7, score.set, createSetScene());
    expect(a.pillars.position).toEqual(b.pillars.position);
    expect(a.lasers.vertices).toEqual(b.lasers.vertices);
    expect(a.cells).toEqual(b.cells);
  });

  it("puts more on stage for a fuller description", () => {
    const short = demoSet("Pillars.").set;
    const long = demoSet(
      "A hall of glass pillars around a black monolith, a halo of light above, rain of thin strings behind, lasers and LED screens across the back, fog on a still lake, shards everywhere."
    ).set;
    const a = setCounts(short), b = setCounts(long);
    expect(b.pillarPairs).toBeGreaterThan(a.pillarPairs);
    expect(b.shards).toBeGreaterThan(a.shards);
    expect(b.emitters).toBeGreaterThan(0);
    expect(b.panels).toBeGreaterThan(0);
    expect(a.emitters).toBe(0);
    expect(long.floor).toBe("water");
  });

  it("draws only the pieces in the set", () => {
    const set: StageSet = { pieces: [{ kind: "lasers", amount: 1 }], floor: "matte" };
    const s = computeSet(at("build"), 3, set);
    expect(s.pillars.count).toBe(0);
    expect(s.shards.count).toBe(0);
    expect(s.strings.count).toBe(0);
    expect(s.panelCount).toBe(0);
    expect(s.lasers.count).toBeGreaterThan(0);
    expect(s.beamCount).toBe(1);
  });

  it("clears the stage in silence, leaving one beam", () => {
    const s = computeSet(at("silence", 0.9), 3, DEFAULT_SET);
    expect(visible(s.pillars.scale, s.pillars.count)).toBe(0);
    expect(visible(s.shards.scale, s.shards.count)).toBe(0);
    expect(s.beams[2]!).toBeGreaterThan(0.5);
    const ordered = computeSet(at("order"), 3, DEFAULT_SET);
    expect(visible(ordered.pillars.scale, ordered.pillars.count)).toBe(ordered.pillars.count);
  });

  it("keeps the screens' jumps to at most one every two beats", () => {
    const set: StageSet = { pieces: [{ kind: "screens", amount: 1 }], floor: "mirror" };
    const s = score.sections.find((x) => x.archetype === "fracture")!;
    // Frames 1/60 s apart at 160 BPM; a jump of more than half a cell's range is a pattern change.
    const step = 160 / 60 / 60;
    let jumps = 0;
    let prev = computeSet(sample(score, s.startBeat), 3, set).cells.slice();
    for (let b = s.startBeat + step; b < s.startBeat + Math.min(8, s.lengthBeats); b += step) {
      const cur = computeSet(sample(score, b), 3, set).cells;
      if (cur.some((v, i) => Math.abs(v - prev[i]!) > 0.5)) jumps++;
      prev = cur.slice();
    }
    expect(jumps).toBeLessThanOrEqual(Math.ceil(Math.min(8, s.lengthBeats) / 2) + 1);
  });

  it("widens the view on a portrait stage only", () => {
    expect(framing(16 / 9, 42)).toEqual({ fov: 42, lift: 0 });
    const phone = framing(393 / 852, 42);
    expect(phone.fov).toBeGreaterThan(60);
    expect(phone.fov).toBeLessThanOrEqual(75);
    expect(phone.lift).toBeGreaterThan(0);
  });
});
