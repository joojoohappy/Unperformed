import { describe, expect, it } from "vitest";
import { Interpretation, validateScore, validateWith, durationSeconds } from "../src";
import { baseScore } from "./helpers";

describe("PerformanceScore schema", () => {
  it("accepts a compiled score", () => {
    const r = validateScore(baseScore());
    expect(r.ok).toBe(true);
  });

  it("round-trips through JSON without loss", () => {
    const s = baseScore();
    const r = validateScore(JSON.parse(JSON.stringify(s)));
    expect(r.ok && r.value).toEqual(s);
  });

  it("rejects gaps between sections", () => {
    const s = structuredClone(baseScore());
    s.sections[1]!.startBeat += 4;
    const r = validateScore(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join(" ")).toMatch(/starts at/);
  });

  it("rejects a release on a non-climax section", () => {
    const s = structuredClone(baseScore());
    s.sections[0]!.release = { mode: "held", holdBeats: 4 };
    expect(validateScore(s).ok).toBe(false);
  });

  it("rejects out-of-vocabulary effects and executable payloads", () => {
    const s = structuredClone(baseScore()) as unknown as { sections: { geometry: { form: string } }[] };
    s.sections[0]!.geometry.form = "javascript:alert(1)";
    expect(validateScore(s).ok).toBe(false);
  });

  it("rejects unknown colours and out-of-range numbers", () => {
    const s = structuredClone(baseScore());
    s.sections[0]!.lighting.key = "red";
    s.sections[1]!.lighting.intensity = 3;
    const r = validateScore(s);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.length).toBeGreaterThanOrEqual(2);
  });

  it("computes duration from tempo and beats", () => {
    const s = baseScore(75);
    expect(durationSeconds(s)).toBeGreaterThanOrEqual(60);
    expect(durationSeconds(s)).toBeLessThanOrEqual(90);
  });
});

describe("Interpretation contract (LLM output)", () => {
  it("rejects malformed model output with readable errors", () => {
    const bad = { title: "", phases: [], mood: "happy", palette: { base: "blue" } };
    const r = validateWith(Interpretation, bad);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.some((e) => e.startsWith("mood"))).toBe(true);
  });

  it("rejects a climax index that does not point at a climax phase", () => {
    const fixture = {
      title: "x",
      summary: "y",
      understood: ["z"],
      mood: "serene",
      palette: { base: "#000000", accent: "#111111", climax: "#ffffff" },
      set: { pieces: [{ kind: "beam", amount: 0.5 }], floor: "mirror" },
      tempoBpm: 100,
      phases: [
        { name: "a", archetype: "order", weight: 1, energyFrom: 0, energyTo: 0.2, geometry: "grid", sound: "drone", note: "" },
        { name: "b", archetype: "climax", weight: 1, energyFrom: 0.9, energyTo: 0.8, geometry: "dust", sound: "swell", note: "" },
        { name: "c", archetype: "silence", weight: 1, energyFrom: 0.1, energyTo: 0, geometry: "void", sound: "silence", note: "" }
      ],
      climax: { phaseIndex: 0, release: "held", holdBeats: 4 },
      constraints: [],
      strategy: "s"
    };
    expect(validateWith(Interpretation, fixture).ok).toBe(false);
    fixture.climax.phaseIndex = 1;
    expect(validateWith(Interpretation, fixture).ok).toBe(true);
  });
});
