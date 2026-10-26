/**
 * Orchestrates the co-director in either mode.
 *
 * Demo mode: deterministic rules from performance-core, no network.
 * Live mode: the Live AI service, with every output validated and bounded
 * by the same deterministic engine. If a live negotiation call fails, the
 * rule-based director answers instead and the round is labelled as a
 * fallback, with the reason, in the UI and in the session history.
 */
import {
  type ChangeRequest,
  type DirectorAdvice,
  type Interpretation,
  type Mood,
  type NegotiationRound,
  type SessionState,
  type Source,
  climaxSection,
  demoInterpret,
  openRound,
  parseRequestRules
} from "@unperformed/performance-core";
import * as live from "./live";
import { LiveError } from "./live";

export interface Usage {
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

export interface Timed<T> {
  value: T;
  ms: number;
  source: Source;
  usage?: Usage;
}

const now = () => performance.now();
const usageOf = (m: live.LiveMeta): Usage => ({ inputTokens: m.inputTokens, outputTokens: m.outputTokens, costUsd: m.estimatedCostUsd ?? 0 });

export async function interpretIdea(mode: "demo" | "live", intent: string, mood: Mood | null, locale: "en" | "zh-TW"): Promise<Timed<Interpretation>> {
  const t0 = now();
  if (mode === "demo") {
    return { value: demoInterpret({ intent, mood, locale }), ms: now() - t0, source: { kind: "rules" } };
  }
  const r = await live.interpret(intent, mood, locale);
  return { value: r.interpretation, ms: now() - t0, source: { kind: "llm", model: r.meta.model }, usage: usageOf(r.meta) };
}

export interface NegotiateResult {
  round: NegotiationRound;
  ms: number;
  usage?: Usage;
  fallbackReason?: string;
}

export async function negotiate(state: SessionState, text: string, ids: { round: string; request: string }): Promise<NegotiateResult> {
  const score = state.score!;
  const t0 = now();
  if (state.mode === "demo") {
    const request: ChangeRequest = { id: ids.request, text, kind: parseRequestRules(text), source: { kind: "rules" } };
    return { round: openRound({ id: ids.round, score, request, memory: state.memory }), ms: now() - t0 };
  }
  try {
    const r = await live.analyze({
      request: text,
      score,
      decidedTopics: state.memory.entries.filter((e) => e.directorObjected).map((e) => e.topic),
      strategy: state.interpretation?.strategy ?? "",
      locale: state.locale
    });
    const source: Source = { kind: "llm", model: r.meta.model };
    const request: ChangeRequest = { id: ids.request, text, kind: r.analysis.kind, source };
    const advice: DirectorAdvice = {
      creativeDifference: r.analysis.creativeDifference,
      rationale: r.analysis.rationale,
      counter: r.analysis.counter,
      source
    };
    return { round: openRound({ id: ids.round, score, request, memory: state.memory, advice }), ms: now() - t0, usage: usageOf(r.meta) };
  } catch (e) {
    const reason = e instanceof LiveError ? e.code : "error";
    const source: Source = { kind: "rules-fallback", reason };
    const request: ChangeRequest = { id: ids.request, text, kind: parseRequestRules(text), source };
    const round = openRound({ id: ids.round, score, request, memory: state.memory });
    return { round: { ...round, source }, ms: now() - t0, fallbackReason: reason };
  }
}

export async function combineAdvice(state: SessionState, round: NegotiationRound): Promise<{ advice: DirectorAdvice | null; ms: number; usage?: Usage; fallbackReason?: string }> {
  const t0 = now();
  if (state.mode === "demo" || !state.score) return { advice: null, ms: now() - t0 };
  const climax = climaxSection(state.score);
  try {
    const human = round.options.find((o) => o.id === "human");
    const ai = round.options.find((o) => o.id === "ai");
    const r = await live.combine({
      request: round.request.text,
      humanPlan: human ? JSON.stringify(human.changes.map((c) => [c.path, c.after])).slice(0, 300) : "",
      aiProposal: ai ? JSON.stringify(ai.changes.map((c) => [c.path, c.after])).slice(0, 300) : "",
      climaxLengthBeats: climax?.lengthBeats ?? 16,
      locale: state.locale
    });
    const source: Source = { kind: "llm", model: r.meta.model };
    return {
      advice: { creativeDifference: true, rationale: r.advice.rationale, counter: { releaseMode: "held", holdBeats: r.advice.holdBeats }, source },
      ms: now() - t0,
      usage: usageOf(r.meta)
    };
  } catch (e) {
    return { advice: null, ms: now() - t0, fallbackReason: e instanceof LiveError ? e.code : "error" };
  }
}
