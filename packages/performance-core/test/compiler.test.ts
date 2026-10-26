import { describe, expect, it } from "vitest";
import { allocateBars, compile, demoInterpret, EXAMPLE_INTENTS, validateScore } from "../src";

describe("compiler", () => {
  it("is deterministic for the same interpretation and seed", () => {
    const i = demoInterpret({ intent: EXAMPLE_INTENTS.en[0]!, locale: "en" });
    expect(compile(i, { durationSec: 75, seed: 7 })).toEqual(compile(i, { durationSec: 75, seed: 7 }));
  });

  it("produces valid scores for every example in both languages and lengths", () => {
    for (const locale of ["en", "zh-TW"] as const) {
      for (const intent of EXAMPLE_INTENTS[locale]) {
        for (const durationSec of [30, 75]) {
          const { score } = compile(demoInterpret({ intent, locale }), { durationSec, seed: 1 });
          expect(validateScore(score).ok).toBe(true);
          const secs = (score.totalBeats * 60) / score.tempoBpm;
          expect(Math.abs(secs - durationSec)).toBeLessThan(6);
        }
      }
    }
  });

  it("records every routine camera choice as an AI-local decision", () => {
    const { score, localDecisions } = compile(demoInterpret({ intent: EXAMPLE_INTENTS.en[0]!, locale: "en" }), { durationSec: 75, seed: 1 });
    const cams = localDecisions.filter((d) => d.field === "camera.move");
    expect(cams).toHaveLength(score.sections.length);
    cams.forEach((d) => expect(score.sections.find((s) => s.id === d.sectionId)!.camera.move).toBe(d.value));
  });

  it("never repeats a moving camera back-to-back", () => {
    const { score } = compile(demoInterpret({ intent: EXAMPLE_INTENTS.en[2]!, locale: "en" }), { durationSec: 75, seed: 1 });
    for (let i = 1; i < score.sections.length; i++) {
      const a = score.sections[i - 1]!.camera.move;
      const b = score.sections[i]!.camera.move;
      if (a !== "static") expect(b).not.toBe(a);
    }
  });

  it("keeps each phase's note on its section, for the stage caption", () => {
    for (const lang of ["en", "zh-TW"] as const) {
      const interp = demoInterpret({ intent: EXAMPLE_INTENTS[lang][0]!, locale: lang });
      const { score } = compile(interp, { durationSec: 75, seed: 1 });
      expect(score.sections.map((s) => s.note)).toEqual(interp.phases.map((p) => p.note.trim() || undefined));
    }
  });

  it("allocates bars exactly with a minimum per phase", () => {
    expect(allocateBars([3, 2, 2, 2, 2], 38).reduce((a, b) => a + b, 0)).toBe(38);
    expect(Math.min(...allocateBars([5, 1, 1], 12))).toBeGreaterThanOrEqual(2);
    expect(() => allocateBars([1, 1, 1], 2)).toThrow();
  });

  it("proposes constraints but never approves them on the human's behalf", () => {
    const { score } = compile(demoInterpret({ intent: EXAMPLE_INTENTS.en[0]!, locale: "en" }), { durationSec: 75, seed: 1 });
    expect(score.constraints.length).toBeGreaterThan(0);
    expect(score.constraints.every((c) => c.status === "proposed" && c.owner === "human")).toBe(true);
  });
});
