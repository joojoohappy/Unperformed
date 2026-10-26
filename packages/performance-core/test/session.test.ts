import { describe, expect, it } from "vitest";
import {
  buildReview,
  compile,
  demoInterpret,
  EXAMPLE_INTENTS,
  initialSession,
  openRound,
  parseRequestRules,
  reduce,
  seedFor,
  type SessionState
} from "../src";

function run(): SessionState {
  const text = EXAMPLE_INTENTS.en[0]!;
  let s = initialSession("test", 1000, "en", "demo");
  s = reduce(s, { type: "submit-intent", at: 1100, text, mood: null, durationSec: 75 });
  const interpretation = demoInterpret({ intent: text, locale: "en" });
  const compiled = compile(interpretation, { durationSec: 75, seed: seedFor(text) });
  s = reduce(s, { type: "interpretation-ready", at: 1200, interpretation, source: { kind: "rules" }, compiled, compileMs: 1 });
  for (const c of s.score!.constraints) s = reduce(s, { type: "constraint-status", at: 1300, constraintId: c.id, status: "approved" });
  const request = { id: "r1", text: "explode at the climax", kind: parseRequestRules("explode at the climax"), source: { kind: "rules" as const } };
  s = reduce(s, { type: "open-round", at: 1400, round: openRound({ id: "n1", score: s.score!, request, memory: s.memory }) });
  s = reduce(s, { type: "combine", at: 1500, roundId: "n1" });
  s = reduce(s, { type: "resolve", at: 1600, roundId: "n1", optionId: "combined" });
  s = reduce(s, { type: "human-edit", at: 1700, patch: { ops: [{ op: "setCamera", sectionId: "s1", move: "static" }] }, label: { literal: "camera" } });
  return s;
}

describe("session reducer and review", () => {
  it("records a complete, ordered decision history", () => {
    const s = run();
    const types = s.events.map((e) => e.type);
    expect(types[0]).toBe("intent");
    expect(types).toEqual(expect.arrayContaining(["interpretation", "composed", "ai-local-decision", "constraint", "request", "proposal", "decision", "revision", "human-edit"]));
    expect(s.events.map((e) => e.seq)).toEqual(s.events.map((_, i) => i + 1));
    expect(s.events.every((e, i, a) => i === 0 || e.at >= a[i - 1]!.at)).toBe(true);
  });

  it("keeps the original plan untouched while the score evolves", () => {
    const s = run();
    expect(s.originalScore).not.toEqual(s.score);
    expect(s.originalScore!.sections.find((x) => x.archetype === "climax")!.release).toEqual({ mode: "staggered", holdBeats: 4 });
    expect(s.score!.sections.find((x) => x.archetype === "climax")!.release).toEqual({ mode: "held", holdBeats: 4 });
  });

  it("builds a factual review from recorded events only", () => {
    const r = buildReview(run());
    expect(r.counts.accepted.combined).toBe(1);
    expect(r.counts.proposals).toBe(1);
    expect(r.netChanges.some((c) => c.path.endsWith("release.mode"))).toBe(true);
    expect(r.revisions.length).toBe(2);
  });

  it("refuses an edit that would break an approved constraint and records why", () => {
    let s = run();
    const last = s.score!.sections[s.score!.sections.length - 1]!;
    const before = s.score;
    s = reduce(s, { type: "human-edit", at: 1800, patch: { ops: [{ op: "setSound", sectionId: last.id, texture: "pulse" }] }, label: { literal: "x" } });
    expect(s.score).toBe(before);
    expect(s.lastError).not.toBeNull();
    expect(s.events[s.events.length - 1]!.type).toBe("rejected");
  });

  it("serialises and restores losslessly", () => {
    const s = run();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});
