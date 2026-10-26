import { applyPatch, compile, demoInterpret, EXAMPLE_INTENTS, type PerformanceScore } from "../src";

export const INTENT = EXAMPLE_INTENTS.en[0]!;

export function baseScore(durationSec = 75): PerformanceScore {
  return compile(demoInterpret({ intent: INTENT, locale: "en" }), { durationSec, seed: 1234 }).score;
}

/** The demo score with every proposed constraint approved by a human. */
export function approvedScore(durationSec = 75): PerformanceScore {
  const s = baseScore(durationSec);
  const r = applyPatch(
    s,
    { ops: s.constraints.map((c) => ({ op: "setConstraintStatus" as const, constraintId: c.id, status: "approved" as const })) },
    { actor: "human", humanApproved: true }
  );
  if (!r.ok) throw new Error("could not approve constraints");
  return r.score;
}
