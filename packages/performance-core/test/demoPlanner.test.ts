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

  it("builds a fuller stage set from a fuller description", () => {
    const short = demoInterpret({ intent: "a concert", locale: "en" }).set;
    const long = demoInterpret({
      intent: "A concert in a crystal temple: lasers cut through fog, a ring of light hangs over a black door, the lyrics are projected as words on LED screens, and at the peak the glass pillars shatter.",
      locale: "en"
    }).set;
    expect(long.pieces.length).toBeGreaterThan(short.pieces.length);
    const total = (s: typeof long) => s.pieces.reduce((a, p) => a + p.amount, 0);
    expect(total(long)).toBeGreaterThan(total(short) * 2);
    expect(short.pieces.map((p) => p.kind)).toContain("lasers");
    expect(long.pieces.map((p) => p.kind)).toEqual(expect.arrayContaining(["pillars", "monolith", "ring", "lasers", "screens", "words", "shards", "haze"]));
  });

  it("reads set pieces and the floor in Traditional Chinese", () => {
    const set = demoInterpret({ intent: "海上的神殿，雷射穿過霧", locale: "zh-TW" }).set;
    expect(set.floor).toBe("water");
    expect(set.pieces.map((p) => p.kind)).toEqual(expect.arrayContaining(["pillars", "lasers", "haze"]));
  });

  it("gives different ideas different stages", () => {
    const kinds = (intent: string) => demoInterpret({ intent, locale: "en" }).set.pieces.map((p) => p.kind).join();
    expect(new Set(EXAMPLE_INTENTS.en.map(kinds)).size).toBe(EXAMPLE_INTENTS.en.length);
  });

  it("builds the stage from what the idea names once it names enough", () => {
    // A collapse arc implies pillars and a monolith, but a poem in rain and fog that shatters asks for none.
    const set = demoInterpret({ intent: "把我寫給她的詩投影在空間裡，文字在雨和霧裡漂浮，然後碎裂，最後沉進水面。", locale: "zh-TW" }).set;
    expect(set.pieces.map((p) => p.kind)).toEqual(["beam", "strings", "words", "shards", "haze"]);
    expect(set.floor).toBe("water");
    // 水晶 (crystal) and 石碑 (a stone tablet) do not set the floor.
    expect(demoInterpret({ intent: "水晶柱的神殿，中間一塊黑色石碑", locale: "zh-TW" }).set.floor).toBe("mirror");
  });
});
