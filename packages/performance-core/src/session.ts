/**
 * Creative session: state, actions and the recorded event history.
 *
 * A pure reducer. Every human decision, AI suggestion, approval and revision
 * becomes an event, and the REVIEW stage renders those events directly —
 * nothing in the review is generated after the fact.
 */
import { type CompileResult, type LocalDecision, compile } from "./compiler";
import type { Locale } from "./demoPlanner";
import type { Interpretation } from "./interpretation";
import {
  type CreativeMemory,
  type DirectorAdvice,
  type NegotiationRound,
  type OptionId,
  type Source,
  addCombinedOption,
  resolveRound
} from "./negotiation";
import { type FieldChange, type ScorePatch, applyPatch } from "./patch";
import type { Mood, PerformanceScore } from "./schema";
import { type Text, t } from "./text";
import { hashString } from "./util";

export type Stage = "imagine" | "compose" | "negotiate" | "rehearse" | "perform" | "review";
export const STAGES: Stage[] = ["imagine", "compose", "negotiate", "rehearse", "perform", "review"];

export type Mode = "demo" | "live";

export type EventType =
  | "intent"
  | "interpretation"
  | "composed"
  | "ai-local-decision"
  | "constraint"
  | "request"
  | "proposal"
  | "decision"
  | "revision"
  | "human-edit"
  | "rejected"
  | "performance"
  | "intervention"
  | "fallback";

export interface SessionEvent {
  seq: number;
  /** Milliseconds since the session started. */
  at: number;
  type: EventType;
  actor: "human" | "ai" | "system";
  summary: Text;
  source?: Source;
  changes?: FieldChange[];
  data?: Record<string, unknown>;
}

export interface Metrics {
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  latenciesMs: { kind: "interpret" | "negotiate" | "combine"; ms: number; source: string }[];
  compileMs: number[];
  performances: { avgFps: number; p95FrameMs: number; frames: number; renderer: string }[];
}

export interface SessionState {
  version: 1;
  id: string;
  startedAt: number;
  locale: Locale;
  mode: Mode;
  stage: Stage;
  intent: { text: string; mood: Mood | null; durationSec: number } | null;
  interpretation: Interpretation | null;
  interpretationSource: Source | null;
  originalScore: PerformanceScore | null;
  score: PerformanceScore | null;
  localDecisions: LocalDecision[];
  rounds: NegotiationRound[];
  memory: CreativeMemory;
  events: SessionEvent[];
  metrics: Metrics;
  lastError: Text | null;
}

export type Action =
  | { type: "reset"; at: number; locale: Locale; mode: Mode; id: string }
  | { type: "set-locale"; locale: Locale }
  | { type: "set-mode"; mode: Mode }
  | { type: "goto"; stage: Stage }
  | { type: "submit-intent"; at: number; text: string; mood: Mood | null; durationSec: number }
  | {
      type: "interpretation-ready";
      at: number;
      interpretation: Interpretation;
      source: Source;
      compileMs: number;
      compiled: CompileResult;
    }
  | { type: "error"; at: number; error: Text }
  | { type: "clear-error" }
  | { type: "fallback"; at: number; reason: string; scope: "interpret" | "negotiate" }
  | { type: "constraint-status"; at: number; constraintId: string; status: "approved" | "rejected" }
  | { type: "human-edit"; at: number; patch: ScorePatch; label: Text }
  | { type: "open-round"; at: number; round: NegotiationRound }
  | { type: "combine"; at: number; roundId: string; advice?: DirectorAdvice | null }
  | { type: "resolve"; at: number; roundId: string; optionId: OptionId }
  | { type: "metric-latency"; kind: "interpret" | "negotiate" | "combine"; ms: number; source: string; usage?: { inputTokens: number; outputTokens: number; costUsd: number } }
  | { type: "performance"; at: number; phase: "started" | "completed" | "stopped"; stats?: Metrics["performances"][number] }
  | { type: "intervention"; at: number; what: "pause" | "resume" | "blackout-on" | "blackout-off" | "master"; value?: number };

export function emptyMetrics(): Metrics {
  return { modelCalls: 0, inputTokens: 0, outputTokens: 0, estimatedCostUsd: 0, latenciesMs: [], compileMs: [], performances: [] };
}

export function initialSession(id: string, startedAt: number, locale: Locale, mode: Mode): SessionState {
  return {
    version: 1,
    id,
    startedAt,
    locale,
    mode,
    stage: "imagine",
    intent: null,
    interpretation: null,
    interpretationSource: null,
    originalScore: null,
    score: null,
    localDecisions: [],
    rounds: [],
    memory: { entries: [] },
    events: [],
    metrics: emptyMetrics(),
    lastError: null
  };
}

function push(state: SessionState, at: number, e: Omit<SessionEvent, "seq" | "at">): SessionEvent[] {
  return [...state.events, { seq: state.events.length + 1, at: Math.max(0, at - state.startedAt), ...e }];
}

/** Seed for a session's score: derived from the intent, so the same idea composes the same score. */
export function seedFor(text: string): number {
  return hashString(text.trim().toLowerCase());
}

export function reduce(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case "reset":
      return initialSession(action.id, action.at, action.locale, action.mode);
    case "set-locale":
      return { ...state, locale: action.locale };
    case "set-mode":
      return { ...state, mode: action.mode };
    case "goto":
      if (action.stage !== "imagine" && !state.score) return state;
      return { ...state, stage: action.stage };
    case "submit-intent":
      return {
        ...state,
        intent: { text: action.text, mood: action.mood, durationSec: action.durationSec },
        lastError: null,
        events: push(state, action.at, {
          type: "intent",
          actor: "human",
          summary: t("event.intent"),
          data: { text: action.text, mood: action.mood, durationSec: action.durationSec }
        })
      };
    case "interpretation-ready": {
      let events = push(state, action.at, {
        type: "interpretation",
        actor: "ai",
        source: action.source,
        summary: t("event.interpretation", { title: action.interpretation.title }),
        data: { understood: action.interpretation.understood, strategy: action.interpretation.strategy }
      });
      const s1: SessionState = { ...state, events };
      events = push(s1, action.at, {
        type: "composed",
        actor: "system",
        summary: t("event.composed", { sections: action.compiled.score.sections.length, beats: action.compiled.score.totalBeats }),
        data: { structure: action.compiled.score.sections.map((s) => ({ id: s.id, name: s.name, archetype: s.archetype, lengthBeats: s.lengthBeats })) }
      });
      let s2: SessionState = { ...s1, events };
      for (const d of action.compiled.localDecisions) {
        s2 = {
          ...s2,
          events: push(s2, action.at, {
            type: "ai-local-decision",
            actor: "ai",
            source: { kind: "rules" },
            summary: d.reason,
            data: { sectionId: d.sectionId, field: d.field, value: d.value }
          })
        };
      }
      return {
        ...s2,
        stage: "compose",
        interpretation: action.interpretation,
        interpretationSource: action.source,
        originalScore: action.compiled.score,
        score: action.compiled.score,
        localDecisions: action.compiled.localDecisions,
        rounds: [],
        memory: { entries: [] },
        metrics: { ...s2.metrics, compileMs: [...s2.metrics.compileMs, action.compileMs] }
      };
    }
    case "error":
      return { ...state, lastError: action.error };
    case "clear-error":
      return { ...state, lastError: null };
    case "fallback":
      return {
        ...state,
        events: push(state, action.at, { type: "fallback", actor: "system", summary: t("event.fallback", { scope: action.scope, reason: action.reason }) })
      };
    case "constraint-status": {
      if (!state.score) return state;
      const c = state.score.constraints.find((x) => x.id === action.constraintId);
      if (!c) return state;
      const patch: ScorePatch =
        action.status === "approved"
          ? { ops: [{ op: "setConstraintStatus", constraintId: c.id, status: "approved" }] }
          : { ops: [{ op: "removeConstraint", constraintId: c.id }] };
      const r = applyPatch(state.score, patch, { actor: "human", humanApproved: true });
      if (!r.ok) {
        const first = r.rejected[0];
        return {
          ...state,
          lastError: t("error.constraintBlocked", { text: c.text }),
          events: push(state, action.at, {
            type: "rejected",
            actor: "system",
            summary: t("event.constraintBlocked", { text: c.text }),
            data: { reason: first }
          })
        };
      }
      return {
        ...state,
        score: r.score,
        lastError: null,
        events: push(state, action.at, {
          type: "constraint",
          actor: "human",
          summary: t(action.status === "approved" ? "event.constraintApproved" : "event.constraintRejected", { text: c.text }),
          changes: r.changes
        })
      };
    }
    case "human-edit": {
      if (!state.score) return state;
      const r = applyPatch(state.score, action.patch, { actor: "human", humanApproved: true });
      if (!r.ok) {
        const first = r.rejected[0]!;
        const why =
          first.code === "violates-constraint"
            ? t("error.editViolates", { text: state.score.constraints.find((c) => c.id === first.constraintId)?.text ?? first.constraintId })
            : t("error.editRejected", { code: first.code });
        return {
          ...state,
          lastError: why,
          events: push(state, action.at, { type: "rejected", actor: "system", summary: why, data: { reason: first } })
        };
      }
      if (!r.changes.length) return state;
      return {
        ...state,
        score: r.score,
        lastError: null,
        events: push(state, action.at, { type: "human-edit", actor: "human", summary: action.label, changes: r.changes })
      };
    }
    case "open-round": {
      const r = action.round;
      let events = push(state, action.at, {
        type: "request",
        actor: "human",
        source: r.request.source,
        summary: t("event.request", { kind: r.request.kind }),
        data: { text: r.request.text, kind: r.request.kind }
      });
      const s1 = { ...state, events };
      events = push(s1, action.at, {
        type: "proposal",
        actor: "ai",
        source: r.source,
        summary: r.message,
        data: { roundId: r.id, kind: r.kind, options: r.options.map((o) => o.id) }
      });
      return { ...state, rounds: [...state.rounds, r], events, lastError: null };
    }
    case "combine": {
      if (!state.score) return state;
      const score = state.score;
      const rounds = state.rounds.map((r) => (r.id === action.roundId ? addCombinedOption(r, score, action.advice) : r));
      const changed = rounds.find((r) => r.id === action.roundId);
      return {
        ...state,
        rounds,
        events: push(state, action.at, {
          type: "proposal",
          actor: "ai",
          source: action.advice?.source ?? { kind: "rules" },
          summary: t("event.combined"),
          data: { roundId: action.roundId, options: changed?.options.map((o) => o.id) ?? [] }
        })
      };
    }
    case "resolve": {
      if (!state.score) return state;
      const round = state.rounds.find((r) => r.id === action.roundId);
      if (!round) return state;
      const r = resolveRound(round, action.optionId, state.score, state.memory);
      if (!r.ok) return { ...state, lastError: r.error };
      let events = push(state, action.at, {
        type: "decision",
        actor: "human",
        summary: t("event.decision", { option: action.optionId }),
        data: { roundId: round.id, optionId: action.optionId, topic: round.topic }
      });
      if (r.round.resolution?.changes.length) {
        events = push({ ...state, events }, action.at, {
          type: "revision",
          actor: "system",
          summary: t("event.revision", { count: r.round.resolution.changes.length }),
          changes: r.round.resolution.changes
        });
      }
      return {
        ...state,
        score: r.score,
        memory: r.memory,
        rounds: state.rounds.map((x) => (x.id === round.id ? r.round : x)),
        events,
        lastError: null
      };
    }
    case "metric-latency": {
      const m = state.metrics;
      const usage = action.usage;
      return {
        ...state,
        metrics: {
          ...m,
          modelCalls: m.modelCalls + (usage ? 1 : 0),
          inputTokens: m.inputTokens + (usage?.inputTokens ?? 0),
          outputTokens: m.outputTokens + (usage?.outputTokens ?? 0),
          estimatedCostUsd: m.estimatedCostUsd + (usage?.costUsd ?? 0),
          latenciesMs: [...m.latenciesMs, { kind: action.kind, ms: action.ms, source: action.source }]
        }
      };
    }
    case "performance":
      return {
        ...state,
        metrics: action.stats ? { ...state.metrics, performances: [...state.metrics.performances, action.stats] } : state.metrics,
        events: push(state, action.at, {
          type: "performance",
          actor: action.phase === "stopped" ? "human" : "system",
          summary: t(`event.performance.${action.phase}`),
          ...(action.stats ? { data: { ...action.stats } } : {})
        })
      };
    case "intervention":
      return {
        ...state,
        events: push(state, action.at, {
          type: "intervention",
          actor: "human",
          summary: t(`event.intervention.${action.what}`, action.value !== undefined ? { value: Math.round(action.value * 100) } : undefined)
        })
      };
  }
}

/** Convenience used by both modes: compile with timing. */
export function compileTimed(interp: Interpretation, durationSec: number, seed: number, now: () => number): { compiled: CompileResult; ms: number } {
  const t0 = now();
  const compiled = compile(interp, { durationSec, seed });
  return { compiled, ms: now() - t0 };
}
