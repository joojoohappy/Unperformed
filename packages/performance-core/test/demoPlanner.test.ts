import { describe, expect, it } from "vitest";
import { demoInterpret, EXAMPLE_INTENTS, Interpretation, matchCues, validateWith } from "../src";

describe("demo planner (rule-based, not AI)", () => {
  it("reads the canonical example as order → collapse → silence", () => {
    const i = demoInterpret({ intent: EXAMPLE_INTENTS.en[0]!, locale: "en" });
    expect(i.phases.map((p) => p.archetype)).toEqual(["order", "build", "fracture", "climax", "silence"]);
    expect(i.constraints.map((c) => c.kind)).toEqual(["ending-silence", "opening-order"]);
  });

  it("understands the Traditional Chinese example the same way", () => {
    const en = demoInterpret({ intent: EXAMPLE_INTENTS.en[0]!, locale: "en" });
    const zh = demoInterpret({ intent: EXAMPLE_INTENTS["zh-TW"][0]!, locale: "zh-TW" });
    expect(zh.phases.map((p) => p.archetype)).toEqual(en.phases.map((p) => p.archetype));
    expect(zh.title).toBe("秩序，崩解");
  });

  it("states which cues it matched, labelled as demo rules", () => {
    const i = demoInterpret({ intent: "dark night, then dawn", locale: "en" });
    expect(i.understood.join(" ")).toMatch(/demo rules/);
    expect(matchCues("dark night, then dawn")).toEqual(expect.arrayContaining(["dark", "light"]));
  });

  it("falls back to a default arc when nothing matches", () => {
    const i = demoInterpret({ intent: "zzz qqq", locale: "en" });
    expect(i.understood.join(" ")).toMatch(/No known cues/);
    expect(validateWith(Interpretation, i).ok).toBe(true);
  });

  it("always emits a valid interpretation", () => {
    for (const s of ["", "light", "海", "憤怒的光", "perfect order", "rain and silence", "explode"]) {
      expect(validateWith(Interpretation, demoInterpret({ intent: s, locale: "zh-TW" })).ok).toBe(true);
    }
  });

  it("respects an explicit mood", () => {
    expect(demoInterpret({ intent: EXAMPLE_INTENTS.en[0]!, mood: "tender", locale: "en" }).mood).toBe("tender");
  });
});
