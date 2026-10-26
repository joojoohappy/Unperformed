import { describe, expect, it } from "vitest";
import {
  addCombinedOption,
  applyPatch,
  climaxSection,
  CHAOS_ORDER_MARGIN,
  type ChangeRequest,
  type CreativeMemory,
  type DirectorAdvice,
  MIN_REST_SECONDS,
  type NegotiationRound,
  type OptionId,
  type PerformanceScore,
  SILENCE_MAX_LIGHT,
  openRound,
  parseRequestRules,
  resolveRound,
  ruleProposal
} from "../src";
import { approvedScore, baseScore } from "./helpers";

const req = (text: string, id = "r1"): ChangeRequest => ({ id, text, kind: parseRequestRules(text), source: { kind: "rules" } });
const EXPLODE = "I want everything to explode at the climax.";

describe("request parsing (demo rules)", () => {
  it.each([
    [EXPLODE, "climax-burst"],
    ["高潮時我要全部爆炸", "climax-burst"],
    ["高潮的時候，我要一切都炸開。", "climax-burst"],
    ["讓顏色暖一點。", "warmer"],
    ["用一聲巨響結尾。", "end-loud"],
    ["加上頻閃燈。", "add-strobe"],
    ["Add strobe lights", "add-strobe"],
    ["make the ending a loud bang", "end-loud"],
    ["warmer colours please", "warmer"],
    ["the fracture should be more chaotic", "more-chaos"],
    ["Make the ending warmer.", "warm-ending"],
    ["讓結尾更溫暖。", "warm-ending"],
    ["More chaos in the fracture.", "more-chaos"],
    ["崩解段落再混亂一點。", "more-chaos"],
    ["Make it faster.", "faster"],
    ["節奏再快一點。", "faster"],
    ["slow it down a little", "slower"],
    ["放慢一點", "slower"],
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

/** Pick an option and return the resulting score, failing loudly if the engine refuses. */
function pick(round: NegotiationRound, id: OptionId, s: PerformanceScore, memory: CreativeMemory = { entries: [] }) {
  const r = resolveRound(round, id, s, memory);
  if (!r.ok) throw new Error(`could not resolve ${id}`);
  return r;
}

const last = (s: PerformanceScore) => s.sections[s.sections.length - 1]!;
const fracture = (s: PerformanceScore) => s.sections.find((x) => x.archetype === "fracture")!;
const llmPhrase = (rationale: string): DirectorAdvice => ({
  creativeDifference: true,
  rationale,
  // Out-of-scenario numbers a model might send; the rules must ignore them.
  counter: { releaseMode: "held", holdBeats: 16 },
  source: { kind: "llm", model: "test-model" }
});

describe("warm ending (lighting a silent ending)", () => {
  const WARM = "Make the ending warmer.";

  it("objects when the warmth would light up a silent ending, and proposes an afterglow", () => {
    const s = baseScore(); // constraints proposed only, so nothing binding yet
    const round = openRound({ id: "n1", score: s, request: req(WARM), memory: { entries: [] } });
    expect(round.kind).toBe("proposal");
    expect(round.topic).toBe("ending-light");
    expect(round.options.map((o) => o.id)).toEqual(["human", "ai"]);
    expect(pick(round, "human", s).score.sections.at(-1)!.lighting).toMatchObject({ wash: "warm", intensity: 0.35 });
    const ai = last(pick(round, "ai", s).score).lighting;
    expect(ai.wash).toBe("warm");
    expect(ai.intensity).toBeLessThanOrEqual(SILENCE_MAX_LIGHT);
    expect(ai.intensity).toBeGreaterThan(last(s).lighting.intensity);
    const combined = addCombinedOption(round, s);
    const mid = last(pick(combined, "combined", s).score).lighting.intensity;
    expect(mid).toBeGreaterThan(ai.intensity);
    expect(mid).toBeLessThan(0.35);
  });

  it("agrees when the ending is not a silence", () => {
    const s = structuredClone(baseScore());
    last(s).archetype = "release";
    last(s).lighting.intensity = 0.3;
    const round = openRound({ id: "n1", score: s, request: req(WARM), memory: { entries: [] } });
    expect(round.kind).toBe("agreement");
    expect(ruleProposal("warm-ending", s)).toBeNull();
  });

  it("defers on a repeat request once the person decided", () => {
    const s = baseScore();
    const first = pick(openRound({ id: "n1", score: s, request: req(WARM), memory: { entries: [] } }), "ai", s);
    const again = openRound({ id: "n2", score: first.score, request: req(WARM, "r2"), memory: first.memory });
    expect(again.kind).toBe("deferral");
  });

  it("surfaces the approved ending-silence constraint and offers an afterglow that respects it", () => {
    const s = approvedScore();
    const round = openRound({ id: "n1", score: s, request: req(WARM), memory: { entries: [] } });
    expect(round.kind).toBe("constraint-conflict");
    expect(round.options.map((o) => o.id)).toEqual(["keep", "ai", "human"]);
    expect(round.options.find((o) => o.id === "ai")!.allowed).toBe(true);
    const ai = pick(round, "ai", s).score;
    expect(ai.constraints.find((c) => c.id === "c1")?.status).toBe("approved");
    expect(last(ai).lighting.wash).toBe("warm");
    expect(round.options.find((o) => o.id === "human")!.unlocksConstraint).toBe("c1");
  });
});

describe("more chaos in the fracture", () => {
  const CHAOS = "More chaos in the fracture.";

  it("objects when the fracture would be as broken as the climax, and holds order just above it", () => {
    const s = approvedScore();
    const climaxOrder = climaxSection(s)!.geometry.order;
    const round = openRound({ id: "n1", score: s, request: req(CHAOS), memory: { entries: [] } });
    expect(round.kind).toBe("proposal");
    const human = fracture(pick(round, "human", s).score);
    const ai = fracture(pick(round, "ai", s).score);
    expect(human.geometry.order).toBeLessThanOrEqual(climaxOrder + 0.1);
    expect(ai.geometry.order).toBeCloseTo(climaxOrder + CHAOS_ORDER_MARGIN, 3);
    // The rest of the request is honoured in both.
    expect(ai.geometry.density).toBe(human.geometry.density);
    expect(ai.energy.to).toBe(human.energy.to);
    expect(ai.camera).toEqual(human.camera);
    const combined = fracture(pick(addCombinedOption(round, s), "combined", s).score).geometry.order;
    expect(combined).toBeGreaterThan(human.geometry.order);
    expect(combined).toBeLessThan(ai.geometry.order);
  });

  it("agrees when the fracture stays clearly more ordered than the climax", () => {
    const s = structuredClone(approvedScore());
    fracture(s).geometry.order = 0.6;
    expect(openRound({ id: "n1", score: s, request: req(CHAOS), memory: { entries: [] } }).kind).toBe("agreement");
  });

  it("defers on a repeat request once the person decided", () => {
    const s = approvedScore();
    const first = pick(openRound({ id: "n1", score: s, request: req(CHAOS), memory: { entries: [] } }), "human", s);
    expect(openRound({ id: "n2", score: first.score, request: req(CHAOS, "r2"), memory: first.memory }).kind).toBe("deferral");
  });

  it("surfaces an approved energy cap and offers chaos without more energy", () => {
    const capped = applyPatch(
      approvedScore(),
      { ops: [{ op: "addConstraint", constraint: { id: "c9", kind: "max-energy", text: "Never above 90% energy.", value: 0.9, status: "approved", owner: "human" } }] },
      { actor: "human", humanApproved: true }
    );
    if (!capped.ok) throw new Error("could not add the cap");
    const s = capped.score;
    const round = openRound({ id: "n1", score: s, request: req(CHAOS), memory: { entries: [] } });
    expect(round.kind).toBe("constraint-conflict");
    expect(round.options.map((o) => o.id)).toEqual(["keep", "ai", "human"]);
    const ai = pick(round, "ai", s).score;
    expect(fracture(ai).energy.to).toBe(fracture(s).energy.to);
    expect(fracture(ai).geometry.order).toBeLessThan(fracture(s).geometry.order);
    expect(round.options.find((o) => o.id === "human")!.label).toEqual({ key: "option.humanUnlock.generic" });
  });

  it("lets a model phrase the objection but not invent one or change its numbers", () => {
    const s = approvedScore();
    const phrased = openRound({ id: "n1", score: s, request: req(CHAOS), memory: { entries: [] }, advice: llmPhrase("Keep the worst for the climax.") });
    expect(phrased.message).toEqual({ literal: "Keep the worst for the climax." });
    expect(phrased.source).toEqual({ kind: "llm", model: "test-model" });
    expect(fracture(pick(phrased, "ai", s).score).geometry.order).toBeCloseTo(climaxSection(s)!.geometry.order + CHAOS_ORDER_MARGIN, 3);
    const calm = structuredClone(s);
    fracture(calm).geometry.order = 0.6;
    expect(openRound({ id: "n2", score: calm, request: req(CHAOS), memory: { entries: [] }, advice: llmPhrase("I object.") }).kind).toBe("agreement");
  });
});

describe("tempo changes", () => {
  const FASTER = "Make it faster.";

  it("objects when speeding up would cut the closing silence under the minimum, and proposes the fastest tempo that keeps it", () => {
    const s = approvedScore(); // 120 BPM, a 28-beat silence: 14 s now, 11.2 s at 150 BPM
    const round = openRound({ id: "n1", score: s, request: req(FASTER), memory: { entries: [] } });
    expect(round.kind).toBe("proposal");
    expect(round.topic).toBe("tempo");
    expect(round.canCombine).toBe(false);
    const human = pick(round, "human", s).score;
    const ai = pick(round, "ai", s).score;
    expect(human.tempoBpm).toBe(150);
    expect(ai.tempoBpm).toBe(140);
    expect((last(ai).lengthBeats * 60) / ai.tempoBpm).toBeGreaterThanOrEqual(MIN_REST_SECONDS);
    expect(round.options.find((o) => o.id === "ai")!.changes).toEqual([{ path: "tempoBpm", before: 120, after: 140 }]);
    expect(ai.humanLocked).toContain("tempoBpm");
  });

  it("agrees when the ending stays long enough, and never objects to slowing down", () => {
    const s = structuredClone(approvedScore());
    s.tempoBpm = 80;
    expect(openRound({ id: "n1", score: s, request: req(FASTER), memory: { entries: [] } }).kind).toBe("agreement");
    const slower = openRound({ id: "n2", score: approvedScore(), request: req("slow it down"), memory: { entries: [] } });
    expect(slower.kind).toBe("agreement");
    expect(pick(slower, "human", approvedScore()).score.tempoBpm).toBe(96);
  });

  it("defers on a repeat request once the person decided", () => {
    const s = approvedScore();
    const first = pick(openRound({ id: "n1", score: s, request: req(FASTER), memory: { entries: [] } }), "ai", s);
    const again = openRound({ id: "n2", score: first.score, request: req(FASTER, "r2"), memory: first.memory });
    expect(again.kind).toBe("deferral");
  });

  it("is not blocked by approved constraints, because no constraint kind covers tempo", () => {
    const s = approvedScore();
    const round = openRound({ id: "n1", score: s, request: req(FASTER), memory: { entries: [] } });
    expect(round.kind).not.toBe("constraint-conflict");
    expect(round.options.every((o) => o.allowed)).toBe(true);
    expect(pick(round, "human", s).score.constraints.every((c) => c.status === "approved")).toBe(true);
  });

  it("says so when the tempo is already at the limit", () => {
    const s = structuredClone(approvedScore());
    s.tempoBpm = 160;
    expect(openRound({ id: "n1", score: s, request: req(FASTER), memory: { entries: [] } }).kind).toBe("not-understood");
  });
});
