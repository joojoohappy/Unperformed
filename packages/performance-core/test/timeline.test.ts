import { describe, expect, it } from "vitest";
import { climaxSection, flashReport, maxFlashesPerSecond, sample, sampleRange, timelineFingerprint, type PerformanceScore } from "../src";
import { approvedScore, baseScore } from "./helpers";

describe("timeline sampler", () => {
  it("replays identically: same score, same frames", () => {
    const s = baseScore();
    expect(sampleRange(s, 30)).toEqual(sampleRange(structuredClone(s), 30));
    expect(timelineFingerprint(s)).toBe(timelineFingerprint(JSON.parse(JSON.stringify(s)) as PerformanceScore));
  });

  it("is order-independent: scrubbing backwards gives the same frame as playing forward", () => {
    const s = baseScore();
    const forward = [10, 50, 90, 130].map((b) => sample(s, b));
    const backward = [130, 90, 50, 10].map((b) => sample(s, b)).reverse();
    expect(backward).toEqual(forward);
  });

  it("changes its fingerprint when the score changes", () => {
    const s = baseScore();
    const t = structuredClone(s);
    climaxSection(t)!.release = { mode: "held", holdBeats: 8 };
    expect(timelineFingerprint(t)).not.toBe(timelineFingerprint(s));
  });

  it("carries the section type for art direction, blended over the transition", () => {
    const s = baseScore();
    for (const [i, sec] of s.sections.entries()) {
      const settled = sample(s, sec.startBeat + sec.lengthBeats - 0.5);
      expect(settled.look).toEqual({ from: sec.archetype, to: sec.archetype, mix: 1 });
      const prev = s.sections[i - 1];
      if (!prev) continue;
      const entering = sample(s, sec.startBeat + 0.25);
      expect(entering.look.to).toBe(sec.archetype);
      if (sec.transition.type === "cut") expect(entering.look.mix).toBe(1);
      else expect(entering.look).toMatchObject({ from: prev.archetype, mix: expect.any(Number) as number });
      expect(entering.look.mix).toBeGreaterThanOrEqual(0);
      expect(entering.look.mix).toBeLessThanOrEqual(1);
    }
  });

  it("holds the light back during a held release, then bursts", () => {
    const s = structuredClone(baseScore());
    const c = climaxSection(s)!;
    c.release = { mode: "held", holdBeats: 8 };
    const holding = sample(s, c.startBeat + 2);
    const released = sample(s, c.startBeat + 9);
    expect(holding.release).toBe("holding");
    expect(released.release).toBe("released");
    expect(released.intensity).toBeGreaterThan(holding.intensity * 3);
  });

  it("starts from black and ends in black", () => {
    const s = baseScore();
    expect(sample(s, 0).blackout).toBe(1);
    expect(sample(s, s.totalBeats).blackout).toBe(1);
    expect(sample(s, s.totalBeats).ended).toBe(true);
  });

  it("applies live overrides without moving the clock", () => {
    const s = baseScore();
    const a = sample(s, 60);
    const b = sample(s, 60, { masterIntensity: 0.5, forceBlackout: true });
    expect(b.beat).toBe(a.beat);
    expect(b.sectionId).toBe(a.sectionId);
    expect(b.intensity).toBeCloseTo(a.intensity * 0.5, 5);
    expect(b.blackout).toBe(1);
  });

  it("removes camera shake and light modulation under reduced motion", () => {
    const s = baseScore();
    const fracture = s.sections.find((x) => x.archetype === "fracture")!;
    const f1 = sample(s, fracture.startBeat + 10, { reducedMotion: true });
    const f2 = sample(s, fracture.startBeat + 10.3, { reducedMotion: true });
    expect(Math.abs(f1.camera.position[0] - f2.camera.position[0])).toBeLessThan(0.01);
  });
});

describe("photosensitive safety", () => {
  it("keeps every demo score within three flashes per second", () => {
    expect(flashReport(baseScore()).safe).toBe(true);
    expect(flashReport(approvedScore(30)).safe).toBe(true);
  });

  it("stays safe even with maximum flicker everywhere", () => {
    const s = structuredClone(baseScore());
    s.sections.forEach((x) => (x.lighting.flicker = 1));
    const r = flashReport(s);
    expect(r.maxFlashesPerSecond).toBeLessThanOrEqual(3);
  });

  it("detects a real strobe in a raw luminance signal", () => {
    const fps = 60;
    const strobe = Array.from({ length: fps * 2 }, (_, i) => (Math.floor(i / 5) % 2 ? 0.9 : 0.05)); // 6 Hz
    expect(maxFlashesPerSecond(strobe, fps)).toBeGreaterThan(3);
  });
});
