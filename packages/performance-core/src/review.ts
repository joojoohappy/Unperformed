/**
 * Review model: a factual digest of a session, built only from recorded state.
 */
import { diffScores, type FieldChange } from "./patch";
import type { SessionEvent, SessionState } from "./session";

export interface ReviewModel {
  intent: SessionState["intent"];
  originalStructure: { id: string; name: string; archetype: string; lengthBeats: number; release?: string }[];
  finalStructure: { id: string; name: string; archetype: string; lengthBeats: number; release?: string }[];
  humanDecisions: SessionEvent[];
  aiSuggestions: SessionEvent[];
  revisions: SessionEvent[];
  netChanges: FieldChange[];
  counts: { human: number; ai: number; system: number; aiLocal: number; proposals: number; accepted: { human: number; ai: number; combined: number; keep: number } };
}

function structure(score: SessionState["score"]): ReviewModel["originalStructure"] {
  return (score?.sections ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    archetype: s.archetype,
    lengthBeats: s.lengthBeats,
    ...(s.release ? { release: `${s.release.mode}${s.release.holdBeats ? `:${s.release.holdBeats}` : ""}` } : {})
  }));
}

export function buildReview(state: SessionState): ReviewModel {
  const ev = state.events;
  const accepted = { human: 0, ai: 0, combined: 0, keep: 0 };
  for (const e of ev) {
    if (e.type === "decision") {
      const id = e.data?.["optionId"] as keyof typeof accepted | undefined;
      if (id && id in accepted) accepted[id]++;
    }
  }
  return {
    intent: state.intent,
    originalStructure: structure(state.originalScore),
    finalStructure: structure(state.score),
    humanDecisions: ev.filter((e) => e.actor === "human"),
    aiSuggestions: ev.filter((e) => e.actor === "ai"),
    revisions: ev.filter((e) => e.type === "revision" || e.type === "human-edit"),
    netChanges: state.originalScore && state.score ? diffScores(state.originalScore, state.score) : [],
    counts: {
      human: ev.filter((e) => e.actor === "human").length,
      ai: ev.filter((e) => e.actor === "ai").length,
      system: ev.filter((e) => e.actor === "system").length,
      aiLocal: ev.filter((e) => e.type === "ai-local-decision").length,
      proposals: state.rounds.filter((r) => r.kind === "proposal").length,
      accepted
    }
  };
}
