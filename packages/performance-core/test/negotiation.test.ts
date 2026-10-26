import { describe, expect, it } from "vitest";
import {
  addCombinedOption,
  climaxSection,
  type ChangeRequest,
  type DirectorAdvice,
  openRound,
  parseRequestRules,
  resolveRound
} from "../src";
import { approvedScore, baseScore } from "./helpers";

const req = (text: string, id = "r1"): ChangeRequest => ({ id, text, kind: parseRequestRules(text), source: { kind: "rules" } });
const EXPLODE = "I want everything to explode at the climax.";

describe("request parsing (demo rules)", () => {
  it.each([
    [EXPLODE, "climax-burst"],
    ["高潮時我要全部爆炸", "climax-burst"],
    ["Add strobe lights", "add-strobe"],
    ["make the ending a loud bang", "end-loud"],
    ["warmer colours please", "warmer"],
    ["the fracture should be more chaotic", "more-chaos"],
    ["make it purple and sad", "unknown"]
  ])("%s → %s", (text, kind) => expect(parseRequestRules(text)).toBe(kind));
});

describe("climax negotiation (the core scenario)", () => {
  it("objects when the build already peaks, and proposes holding the light back", () => {
    const s = approvedScore();
    const round = openRound({ id: "n1", score: s, request: req(EXPLODE), memory: { entries: [] } });
    expect(round.kind).toBe("proposal");
    expect(round.options.map((o) => o.id)).toEqual(["human", "ai"]);
    const ai = round.options.find((o) => o.id === "ai")!;
    expect(ai.changes).toContainEqual(expect.objectContaining({ path: `${climaxSection(s)!.id}.release.mode`, after: "held" }));
    expect(ai.changes).toContainEqual(expect.objectContaining({ path: `${climaxSection(s)!.id}.release.holdBeats`, after: 8 }));
  });

  it("does not disagree just to appear autonomous", () => {
    const s = structuredClone(approvedScore());
    // Make the section before the climax quiet: now an immediate release has contrast.
    const idx = s.sections.findIndex((x) => x.archetype === "climax");
    s.sections[idx - 1]!.energy.to = 0.3;
    const round = openRound({ id: "n1", score: s, request: req(EXPLODE), memory: { entries: [] } });
    expect(round.kind).toBe("agreement");
    expect(round.options.map((o) => o.id)).toEqual(["human"]);
  });

  it("produces an observable score change for each choice", () => {
    const s = approvedScore();
    const round = addCombinedOption(openRound({ id: "n1", score: s, request: req(EXPLODE), memory: { entries: [] } }), s);
    const climaxId = climaxSection(s)!.id;
    const results = Object.fromEntries(
      (["human", "ai", "combined"] as const).map((id) => {
        const r = resolveRound(round, id, s, { entries: [] });
        if (!r.ok) throw new Error(id);
        return [id, r.score.sections.find((x) => x.id === climaxId)!.release];
      })
    );
    expect(results.human).toEqual({ mode: "immediate", holdBeats: 0 });
    expect(results.ai).toEqual({ mode: "held", holdBeats: 8 });
    expect(results.combined).toEqual({ mode: "held", holdBeats: 4 });
  });

  it("locks the approved outcome so the AI cannot quietly revert it", () => {
    const s = approvedScore();
    const round = openRound({ id: "n1", score: s, request: req(EXPLODE), memory: { entries: [] } });
    const r = resolveRound(round, "human", s, { entries: [] });
    expect(r.ok && r.score.humanLocked).toContain(`${climaxSection(s)!.id}.release`);
  });

  it("does not repeat an objection on a topic the human already decided", () => {
    const s = approvedScore();
    const first = openRound({ id: "n1", score: s, request: req(EXPLODE), memory: { entries: [] } });
    const decided = resolveRound(first, "human", s, { entries: [] });
    if (!decided.ok) throw new Error();
    const again = openRound({ id: "n2", score: decided.score, request: req(EXPLODE, "r2"), memory: decided.memory });
    expect(again.kind).toBe("deferral");
    expect(again.options.map((o) => o.id)).toEqual(["human"]);
  });

  it("only allows one combined option and only for real proposals", () => {
    const s = approvedScore();
    const round = openRound({ id: "n1", score: s, request: req(EXPLODE), memory: { entries: [] } });
    const once = addCombinedOption(round, s);
    expect(addCombinedOption(once, s).options).toHaveLength(3);
    const agreement = openRound({ id: "n2", score: s, request: req("warmer colours"), memory: { entries: [] } });
    expect(addCombinedOption(agreement, s)).toBe(agreement);
  });

  it("cannot resolve a round twice", () => {
    const s = approvedScore();
    const round = openRound({ id: "n1", score: s, request: req(EXPLODE), memory: { entries: [] } });
    const r = resolveRound(round, "ai", s, { entries: [] });
    if (!r.ok) throw new Error();
    expect(resolveRound(r.round, "human", r.score, r.memory).ok).toBe(false);
  });
});

describe("model advice is bounded by deterministic rules", () => {
  const llm = (over: Partial<DirectorAdvice> = {}): DirectorAdvice => ({
    creativeDifference: true,
    rationale: "Let the room hold its breath for six beats.",
    counter: { releaseMode: "held", holdBeats: 6 },
    source: { kind: "llm", model: "test-model" },
    ...over
  });

  it("uses the model's rationale and hold length when they are in bounds", () => {
    const s = approvedScore();
    const round = openRound({ id: "n1", score: s, request: req(EXPLODE), memory: { entries: [] }, advice: llm() });
    expect(round.message).toEqual({ literal: "Let the room hold its breath for six beats." });
    expect(round.source).toEqual({ kind: "llm", model: "test-model" });
    const ai = round.options.find((o) => o.id === "ai")!;
    expect(ai.changes).toContainEqual(expect.objectContaining({ path: expect.stringMatching(/release\.holdBeats$/), after: 6 }));
  });

  it("clamps an out-of-range hold suggested by a model", () => {
    const s = approvedScore();
    const round = openRound({ id: "n1", score: s, request: req(EXPLODE), memory: { entries: [] }, advice: llm({ counter: { releaseMode: "held", holdBeats: 400 } }) });
    const climax = climaxSection(s)!;
    const ai = round.options.find((o) => o.id === "ai")!;
    const hold = ai.changes.find((c) => c.path.endsWith("release.holdBeats"))!.after as number;
    expect(hold).toBeLessThanOrEqual(Math.min(16, climax.lengthBeats - 4));
  });

  it("ignores a model objection when the rules see no real creative difference", () => {
    const s = structuredClone(approvedScore());
    const idx = s.sections.findIndex((x) => x.archetype === "climax");
    s.sections[idx - 1]!.energy.to = 0.3;
    const round = openRound({ id: "n1", score: s, request: req(EXPLODE), memory: { entries: [] }, advice: llm() });
    expect(round.kind).toBe("agreement");
  });

  it("never lets model advice override session memory", () => {
    const s = approvedScore();
    const first = resolveRound(openRound({ id: "n1", score: s, request: req(EXPLODE), memory: { entries: [] } }), "human", s, { entries: [] });
    if (!first.ok) throw new Error();
    const again = openRound({ id: "n2", score: first.score, request: req(EXPLODE, "r2"), memory: first.memory, advice: llm() });
    expect(again.kind).toBe("deferral");
  });
});

describe("conflicts and safety", () => {
  it("surfaces a conflict with an approved constraint instead of resolving it silently", () => {
    const s = approvedScore();
    const round = openRound({ id: "n1", score: s, request: req("I want a loud bang at the end"), memory: { entries: [] } });
    expect(round.kind).toBe("constraint-conflict");
    const ids = round.options.map((o) => o.id);
    expect(ids).toEqual(["keep", "ai", "human"]);
    expect(round.options.find((o) => o.id === "human")!.unlocksConstraint).toBe("c1");
    // The AI alternative keeps the ending silent.
    const ai = resolveRound(round, "ai", s, { entries: [] });
    expect(ai.ok && ai.score.constraints.find((c) => c.id === "c1")).toBeTruthy();
  });

  it("applies the loud ending without conflict when the constraint was never approved", () => {
    const s = baseScore();
    const round = openRound({ id: "n1", score: s, request: req("I want a loud bang at the end"), memory: { entries: [] } });
    expect(round.kind).toBe("agreement");
  });

  it("treats strobe requests as a safety limit, not a creative disagreement", () => {
    const s = approvedScore();
    const round = openRound({ id: "n1", score: s, request: req("add strobe flashes everywhere"), memory: { entries: [] } });
    expect(round.kind).toBe("safety");
    expect(round.options.map((o) => o.id)).toEqual(["ai", "keep"]);
    expect(round.canCombine).toBe(false);
  });

  it("says so when it does not understand a request", () => {
    const round = openRound({ id: "n1", score: approvedScore(), request: req("make it purple and sad"), memory: { entries: [] } });
    expect(round.kind).toBe("not-understood");
    expect(round.options).toEqual([]);
  });
});
