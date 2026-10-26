/**
 * Creative negotiation engine.
 *
 * A human asks for a change in words. The engine:
 *   1. turns the request into a typed ChangeRequest (demo rules, or an LLM),
 *   2. builds the human's plan as a concrete patch,
 *   3. runs the deterministic checks that no model can override
 *      (photosensitive safety, approved constraints, session memory),
 *   4. asks the director whether there is a *genuine* creative difference,
 *   5. offers options — the human's plan, the director's proposal, and on
 *      request a combined version — each previewed as a real score diff,
 *   6. applies only the option a human picks, and remembers the decision.
 *
 * The director objects at most once per topic per session. If the human has
 * already decided a topic, the director defers instead of re-arguing.
 */
import { violations } from "./constraints";
import { type FieldChange, type PatchOp, type ScorePatch, applyPatch } from "./patch";
import { type PerformanceScore, type Section, climaxSection } from "./schema";
import { type Text, literal, t } from "./text";
import { clamp, round3, warmShift } from "./util";

export const REQUEST_KINDS = ["climax-burst", "end-loud", "add-strobe", "warmer", "warm-ending", "more-chaos", "faster", "slower", "unknown"] as const;
export type RequestKind = (typeof REQUEST_KINDS)[number];

/** Topics are what session memory is keyed on. */
export const TOPIC_OF: Record<RequestKind, string> = {
  "climax-burst": "climax-release",
  "end-loud": "ending",
  "add-strobe": "light-safety",
  warmer: "palette",
  "warm-ending": "ending-light",
  "more-chaos": "fracture",
  faster: "tempo",
  slower: "tempo",
  unknown: "unknown"
};

export type Source = { kind: "rules" } | { kind: "llm"; model: string } | { kind: "rules-fallback"; reason: string };

export interface ChangeRequest {
  id: string;
  text: string;
  kind: RequestKind;
  source: Source;
}

export type OptionId = "human" | "ai" | "combined" | "keep";

export interface NegotiationOption {
  id: OptionId;
  label: Text;
  description: Text;
  patch: ScorePatch | null;
  /** Concrete preview of what picking this option changes. */
  changes: FieldChange[];
  /** False when the authority gate would refuse it (e.g. it breaks an approved constraint). */
  allowed: boolean;
  blockedBy: Text | null;
  /** If set, choosing this option also removes the named human constraint (human-only decision). */
  unlocksConstraint?: string;
}

export type RoundKind = "proposal" | "agreement" | "constraint-conflict" | "safety" | "deferral" | "not-understood";

export interface NegotiationRound {
  id: string;
  request: ChangeRequest;
  kind: RoundKind;
  topic: string;
  /** The director's message, short and specific. */
  message: Text;
  options: NegotiationOption[];
  canCombine: boolean;
  source: Source;
  status: "open" | "resolved";
  resolution?: { optionId: OptionId; changes: FieldChange[] };
}

export interface MemoryEntry {
  topic: string;
  roundId: string;
  chosen: OptionId;
  /** True once the director has argued this topic; it will not object again. */
  directorObjected: boolean;
}

export interface CreativeMemory {
  entries: MemoryEntry[];
}

/** Optional model-written content for a round. All of it is validated and bounded before use. */
export interface DirectorAdvice {
  creativeDifference: boolean;
  rationale: string;
  counter: { releaseMode: "held" | "staggered"; holdBeats: number } | null;
  source: Source;
}

// --------------------------------------------------------------------------
// 1. Request parsing (demo rules). Live AI mode classifies with an LLM into the same kinds.

const REQUEST_RULES: [RequestKind, RegExp][] = [
  ["add-strobe", /\b(strobe\w*|flash\w*|blink\w*)\b|閃光|頻閃|閃爍|爆閃|閃燈/i],
  ["end-loud", /\b(loud|bang|big|noise|crash)\b.*\b(end|ending|finale|finish)\b|\b(end|ending|finale|finish)\b.*\b(loud|bang|big|crash)\b|(結尾|收尾|結束).*(大聲|爆|巨響|轟)|(大聲|巨響|轟).*(結尾|收尾|結束)/i],
  ["warm-ending", /\b(warm\w*|amber|golden)\b.*\b(end|ending|finale|finish)\b|\b(end|ending|finale|finish)\b.*\b(warm\w*|amber|golden)\b|(結尾|收尾).*(溫暖|暖)|(溫暖|暖色).*(結尾|收尾)/i],
  ["climax-burst", /\b(explo\w*|burst|blow (up|out)|everything at once|all at once)\b|爆炸|爆發|炸開|炸裂|全部.*一起|一口氣.*(爆|釋放)/i],
  ["warmer", /\b(warm\w*|amber|golden|orange)\b|溫暖|暖色|更暖|暖一點|暖一些|金色|琥珀|橘/i],
  ["more-chaos", /\b(more chaos|chaotic|messier|wilder|more broken|harder)\b|更混亂|再混亂|更亂|亂一點|更破碎|更失控/i],
  ["faster", /\b(faster|quicker|speed (it )?up|up the tempo|more tempo)\b|加快|快一點|更快/i],
  ["slower", /\b(slower|slow (it )?down|less rushed)\b|放慢|慢一點|更慢/i]
];

export function parseRequestRules(text: string): RequestKind {
  for (const [kind, re] of REQUEST_RULES) if (re.test(text)) return kind;
  return "unknown";
}

// --------------------------------------------------------------------------
// 2. The human's plan, made concrete.

/** A silent ending stops being silent above this light level (same threshold as the ending-silence constraint). */
export const SILENCE_MAX_LIGHT = 0.1;
/** Light level at which a warm ending is plainly visible. */
const WARM_ENDING_LIGHT = 0.35;
/** A warm afterglow: visible on a dark stage, still within the silence threshold. */
const AFTERGLOW_LIGHT = 0.08;
/** The fracture must stay at least this much more ordered than the climax, or the collapse peaks early. */
export const CHAOS_ORDER_MARGIN = 0.15;
/** A resting ending shorter than this no longer registers as an ending. */
export const MIN_REST_SECONDS = 12;
export const FASTER_FACTOR = 1.25;
export const SLOWER_FACTOR = 0.8;

const RESTING: ReadonlySet<Section["archetype"]> = new Set(["silence", "release", "drift"]);

function lastSection(score: PerformanceScore): Section {
  return score.sections[score.sections.length - 1]!;
}

function fractureSection(score: PerformanceScore): Section | undefined {
  return score.sections.find((s) => s.archetype === "fracture") ?? score.sections.find((s) => s.archetype === "build");
}

const restSeconds = (s: Section, bpm: number): number => (s.lengthBeats * 60) / bpm;

function warmEndingPatch(score: PerformanceScore, intensity: number): ScorePatch {
  const last = lastSection(score);
  return {
    ops: [{ op: "setLighting", sectionId: last.id, wash: "warm", key: warmShift(last.lighting.key, 0.6), intensity: round3(Math.max(last.lighting.intensity, intensity)) }]
  };
}

function chaosPatch(fracture: Section, order: number, withEnergy = true): ScorePatch {
  return {
    ops: [
      { op: "setGeometry", sectionId: fracture.id, order: round3(order), density: round3(clamp(fracture.geometry.density + 0.15)) },
      { op: "setCamera", sectionId: fracture.id, move: "tremor", speed: round3(clamp(fracture.camera.speed + 0.2)) },
      ...(withEnergy ? [{ op: "setEnergy" as const, sectionId: fracture.id, to: round3(clamp(fracture.energy.to + 0.1)) }] : [])
    ]
  };
}

const tempoPatch = (bpm: number): ScorePatch => ({ ops: [{ op: "setTempo", tempoBpm: bpm }] });
const faster = (bpm: number) => Math.min(160, Math.round(bpm * FASTER_FACTOR));
const slower = (bpm: number) => Math.max(60, Math.round(bpm * SLOWER_FACTOR));

export function humanPlan(kind: RequestKind, score: PerformanceScore): ScorePatch | null {
  const climax = climaxSection(score);
  const last = lastSection(score);
  const fracture = fractureSection(score);
  switch (kind) {
    case "climax-burst":
      if (!climax) return null;
      return {
        ops: [
          { op: "setRelease", sectionId: climax.id, mode: "immediate", holdBeats: 0 },
          { op: "setEnergy", sectionId: climax.id, from: 1 },
          { op: "setLighting", sectionId: climax.id, intensity: 1 },
          { op: "setGeometry", sectionId: climax.id, order: 0, density: 1 },
          { op: "setSound", sectionId: climax.id, level: 1 }
        ]
      };
    case "end-loud":
      return {
        ops: [
          { op: "setSound", sectionId: last.id, texture: "swell", level: 1 },
          { op: "setEnergy", sectionId: last.id, to: 0.9 },
          { op: "setLighting", sectionId: last.id, intensity: 0.9 }
        ]
      };
    case "warmer":
      return {
        ops: [
          { op: "setPalette", base: warmShift(score.palette.base, 0.6), accent: warmShift(score.palette.accent, 0.4) },
          ...score.sections.map((s): PatchOp => ({ op: "setLighting", sectionId: s.id, wash: "warm" })),
          ...score.sections
            .filter((s) => s.lighting.key === score.palette.base)
            .map((s): PatchOp => ({ op: "setLighting", sectionId: s.id, key: warmShift(score.palette.base, 0.6) }))
        ]
      };
    case "warm-ending":
      return warmEndingPatch(score, WARM_ENDING_LIGHT);
    case "more-chaos":
      if (!fracture) return null;
      return chaosPatch(fracture, Math.max(0, fracture.geometry.order - 0.25));
    case "faster":
      return faster(score.tempoBpm) === score.tempoBpm ? null : tempoPatch(faster(score.tempoBpm));
    case "slower":
      return slower(score.tempoBpm) === score.tempoBpm ? null : tempoPatch(slower(score.tempoBpm));
    case "add-strobe":
    case "unknown":
      return null;
  }
}

// --------------------------------------------------------------------------
// 3–4. Director evaluation.

function energyEntering(score: PerformanceScore, s: Section): number {
  const idx = score.sections.indexOf(s);
  const prev = score.sections[idx - 1];
  return prev ? prev.energy.to : 0;
}

/** Rule-based proposal for the climax scenario: hold the light back before releasing. */
export function ruleBasedClimaxAdvice(score: PerformanceScore): DirectorAdvice {
  const climax = climaxSection(score);
  if (!climax) return { creativeDifference: false, rationale: "", counter: null, source: { kind: "rules" } };
  const entering = energyEntering(score, climax);
  // A genuine difference only exists when the stage is already loud going in:
  // then an immediate release has nothing to contrast against.
  const creativeDifference = entering >= 0.6;
  const holdBeats = Math.min(8, climax.lengthBeats - 4);
  return {
    creativeDifference,
    rationale: "",
    counter: creativeDifference ? { releaseMode: "held", holdBeats } : null,
    source: { kind: "rules" }
  };
}

/** A creative difference found by a rule, for the scenarios other than the climax. */
export interface RuleProposal {
  message: Text;
  human: Text;
  ai: Text;
  aiPatch: ScorePatch | null;
  /** The middle ground offered on request, or null when the scenario has none. */
  combined: { description: Text; patch: ScorePatch } | null;
}

const pct = (v: number): number => Math.round(v * 100);
const secs = (v: number): string => v.toFixed(1);

/**
 * Deterministic creative-difference rules. Each returns null when there is no
 * genuine difference, so the director agrees instead of arguing.
 *
 * - warm-ending: lighting a silent ending enough to show warmth makes it stop
 *   being silent. Counter: a warm afterglow within the silence threshold.
 * - more-chaos: if the fracture would be as disordered as the climax, the
 *   collapse peaks early. Counter: the same chaos, with order held just above
 *   the climax.
 * - faster: if speeding up pushes a resting ending under MIN_REST_SECONDS, it
 *   no longer reads as an ending. Counter: the fastest tempo that keeps it.
 */
export function ruleProposal(kind: RequestKind, score: PerformanceScore): RuleProposal | null {
  switch (kind) {
    case "warm-ending": {
      const last = lastSection(score);
      if (last.archetype !== "silence" || last.lighting.intensity > SILENCE_MAX_LIGHT) return null;
      const glow = round3(Math.min(SILENCE_MAX_LIGHT, Math.max(last.lighting.intensity, AFTERGLOW_LIGHT)));
      const mid = round3((glow + WARM_ENDING_LIGHT) / 2);
      return {
        message: t("negotiate.warmEnding.proposal", { light: pct(last.lighting.intensity), target: pct(WARM_ENDING_LIGHT), glow: pct(glow) }),
        human: t("option.human.warmEnding", { light: pct(WARM_ENDING_LIGHT) }),
        ai: t("option.ai.warmEnding", { light: pct(glow) }),
        aiPatch: warmEndingPatch(score, glow),
        combined: { description: t("option.combined.warmEnding", { light: pct(mid) }), patch: warmEndingPatch(score, mid) }
      };
    }
    case "more-chaos": {
      const fracture = fractureSection(score);
      const climax = climaxSection(score);
      if (!fracture || !climax || score.sections.indexOf(climax) < score.sections.indexOf(fracture)) return null;
      const planned = round3(Math.max(0, fracture.geometry.order - 0.25));
      const floor = round3(climax.geometry.order + CHAOS_ORDER_MARGIN);
      if (planned >= floor) return null;
      const counter = round3(Math.min(fracture.geometry.order, floor));
      const mid = round3((planned + counter) / 2);
      return {
        message: t("negotiate.chaos.proposal", { order: planned, climax: climax.geometry.order, counter }),
        human: t("option.human.chaos", { order: planned }),
        ai: t("option.ai.chaos", { order: counter }),
        aiPatch: chaosPatch(fracture, counter),
        combined: { description: t("option.combined.chaos", { order: mid }), patch: chaosPatch(fracture, mid) }
      };
    }
    case "faster": {
      const last = lastSection(score);
      const target = faster(score.tempoBpm);
      if (!RESTING.has(last.archetype) || target === score.tempoBpm) return null;
      if (restSeconds(last, score.tempoBpm) < MIN_REST_SECONDS || restSeconds(last, target) >= MIN_REST_SECONDS) return null;
      const counter = Math.max(score.tempoBpm, Math.floor((last.lengthBeats * 60) / MIN_REST_SECONDS));
      return {
        message: t("negotiate.faster.proposal", {
          bpm: target,
          seconds: secs(restSeconds(last, target)),
          min: MIN_REST_SECONDS,
          counter,
          counterSeconds: secs(restSeconds(last, counter))
        }),
        human: t("option.human.tempo", { bpm: target }),
        ai: t("option.ai.faster", { bpm: counter, seconds: secs(restSeconds(last, counter)) }),
        aiPatch: counter === score.tempoBpm ? null : tempoPatch(counter),
        combined: null
      };
    }
    default:
      return null;
  }
}

/** Under an approved constraint: a director alternative that respects it, where the scenario has one. */
function constraintAlternative(kind: RequestKind, score: PerformanceScore): NegotiationOption | null {
  switch (kind) {
    case "end-loud": {
      // Respect the constraint: the loud hit moves to the penultimate section; the ending stays silent.
      const penultimate = score.sections[score.sections.length - 2];
      if (!penultimate) return null;
      return option(score, "ai", t("option.aiEndLoud"), t("option.aiEndLoud.desc"), {
        ops: [{ op: "setSound", sectionId: penultimate.id, texture: "swell", level: 1 }, { op: "setEnergy", sectionId: penultimate.id, to: 0.9 }]
      });
    }
    case "warm-ending": {
      const last = lastSection(score);
      const glow = round3(Math.min(SILENCE_MAX_LIGHT, Math.max(last.lighting.intensity, AFTERGLOW_LIGHT)));
      return option(score, "ai", t("option.aiWarmEnding"), t("option.ai.warmEnding", { light: pct(glow) }), warmEndingPatch(score, glow));
    }
    case "more-chaos": {
      const fracture = fractureSection(score);
      if (!fracture) return null;
      return option(score, "ai", t("option.aiChaos"), t("option.aiChaos.desc"), chaosPatch(fracture, Math.max(0, fracture.geometry.order - 0.25), false));
    }
    default:
      return null;
  }
}

const ENDING_KINDS: ReadonlySet<RequestKind> = new Set(["end-loud", "warm-ending"]);

function preview(score: PerformanceScore, patch: ScorePatch | null, approved: boolean): Pick<NegotiationOption, "changes" | "allowed" | "blockedBy"> {
  if (!patch) return { changes: [], allowed: true, blockedBy: null };
  const r = applyPatch(score, patch, { actor: "human", humanApproved: approved });
  if (r.ok) return { changes: r.changes, allowed: true, blockedBy: null };
  const first = r.rejected[0]!;
  const blockedBy =
    first.code === "violates-constraint"
      ? t("negotiate.blocked.constraint", { id: first.constraintId, text: score.constraints.find((c) => c.id === first.constraintId)?.text ?? first.constraintId })
      : t("negotiate.blocked.generic", { code: first.code });
  return { changes: [], allowed: false, blockedBy };
}

function option(score: PerformanceScore, id: OptionId, label: Text, description: Text, patch: ScorePatch | null, extra: Partial<NegotiationOption> = {}): NegotiationOption {
  return { id, label, description, patch, ...preview(score, patch, true), ...extra };
}

function adviceText(advice: DirectorAdvice | null, fallbackKey: string, params: Record<string, string | number>): Text {
  if (advice && advice.source.kind === "llm" && advice.rationale.trim()) return literal(advice.rationale.trim());
  return t(fallbackKey, params);
}

export interface OpenRoundInput {
  id: string;
  score: PerformanceScore;
  request: ChangeRequest;
  memory: CreativeMemory;
  /** Optional LLM advice. If absent, invalid, or out of bounds, rules decide. */
  advice?: DirectorAdvice | null;
}

export function openRound({ id, score, request, memory, advice = null }: OpenRoundInput): NegotiationRound {
  const topic = TOPIC_OF[request.kind];
  const base = { id, request, topic, status: "open" as "open" | "resolved", canCombine: false };
  const plan = humanPlan(request.kind, score);
  const src: Source = advice?.source ?? { kind: "rules" };

  if (request.kind === "unknown") {
    // Nothing to choose: the round closes immediately so the conversation can continue.
    return { ...base, status: "resolved", kind: "not-understood", message: t("negotiate.notUnderstood"), options: [], source: request.source };
  }

  // Safety is not negotiable and not a creative opinion.
  if (request.kind === "add-strobe") {
    const target = score.sections.filter((s) => s.archetype === "fracture" || s.archetype === "climax");
    const safePulse: ScorePatch = {
      ops: target.map((s): PatchOp => ({ op: "setLighting", sectionId: s.id, flicker: 0.6 }))
    };
    return {
      ...base,
      kind: "safety",
      message: t("negotiate.safety", { hz: 2 }),
      options: [
        option(score, "ai", t("option.safePulse"), t("option.safePulse.desc"), target.length ? safePulse : null),
        option(score, "keep", t("option.keep"), t("option.keep.desc"), null)
      ],
      source: { kind: "rules" }
    };
  }

  if (!plan) {
    return { ...base, status: "resolved", kind: "not-understood", message: t("negotiate.notApplicable"), options: [], source: request.source };
  }

  // Approved constraints: a conflict is surfaced, never silently resolved.
  const humanPreview = preview(score, plan, true);
  if (!humanPreview.allowed) {
    const broken = violations(applyPatchUnchecked(score, plan));
    const constraintId = broken[0]?.constraintId;
    const c = score.constraints.find((x) => x.id === constraintId);
    const text = c?.text ?? "";
    const ending = ENDING_KINDS.has(request.kind);
    const options: NegotiationOption[] = [
      option(score, "keep", t("option.keepConstraint"), t(ending ? "option.keepConstraint.desc" : "option.keepConstraint.generic", { text }), null)
    ];
    const alternative = constraintAlternative(request.kind, score);
    if (alternative) options.push(alternative);
    if (constraintId) {
      const unlockPatch: ScorePatch = { ops: [{ op: "removeConstraint", constraintId }, ...plan.ops] };
      const [label, desc] = request.kind === "end-loud" ? ["option.humanUnlock", "option.humanUnlock.desc"] : ["option.humanUnlock.generic", "option.humanUnlock.generic.desc"];
      options.push(option(score, "human", t(label), t(desc, { text }), unlockPatch, { unlocksConstraint: constraintId }));
    }
    return { ...base, kind: "constraint-conflict", message: t("negotiate.conflict", { text: c?.text ?? "" }), options, source: { kind: "rules" } };
  }

  // Session memory: once a topic has been argued and the human decided, defer.
  const prior = memory.entries.find((e) => e.topic === topic && e.directorObjected);
  if (prior) {
    return {
      ...base,
      kind: "deferral",
      message: t("negotiate.deferral", { choice: prior.chosen }),
      options: [option(score, "human", t("option.applyHuman"), t("option.applyHuman.desc"), plan)],
      source: { kind: "rules" }
    };
  }

  if (request.kind === "climax-burst") {
    const rules = ruleBasedClimaxAdvice(score);
    // A model may phrase the rationale and tune the hold, but the *existence*
    // of a disagreement is checked against the rule: no contrast problem, no objection.
    const use = advice && advice.counter && rules.creativeDifference ? advice : rules;
    if (rules.creativeDifference && use.counter) {
      const climax = climaxSection(score)!;
      const hold = Math.max(2, Math.min(use.counter.holdBeats, climax.lengthBeats - 4, 16));
      const aiPatch: ScorePatch = {
        ops: plan.ops.map((op) => (op.op === "setRelease" ? { ...op, mode: use.counter!.releaseMode, holdBeats: hold } : op))
      };
      const entering = energyEntering(score, climax);
      return {
        ...base,
        kind: "proposal",
        canCombine: true,
        message: adviceText(use, "negotiate.climax.proposal", { beats: hold, energy: Math.round(entering * 100) }),
        options: [
          option(score, "human", t("option.human"), t("option.human.climax"), plan),
          option(score, "ai", t("option.ai"), t("option.ai.climax", { beats: hold }), aiPatch)
        ],
        source: use === advice ? src : { kind: "rules" }
      };
    }
  }

  const rule = request.kind === "climax-burst" ? null : ruleProposal(request.kind, score);
  if (rule) {
    // The rule decides that a difference exists and what the counter is.
    // A model may only phrase it; its numbers are not used here.
    const phrased = advice && advice.source.kind === "llm" && advice.creativeDifference && advice.rationale.trim() ? advice : null;
    return {
      ...base,
      kind: "proposal",
      canCombine: rule.combined !== null,
      message: phrased ? literal(phrased.rationale.trim()) : rule.message,
      options: [option(score, "human", t("option.human"), rule.human, plan), option(score, "ai", t("option.ai"), rule.ai, rule.aiPatch)],
      source: phrased ? phrased.source : { kind: "rules" }
    };
  }

  // No genuine creative difference: say so and offer the human's plan as is.
  return {
    ...base,
    kind: "agreement",
    message: t("negotiate.agreement"),
    options: [option(score, "human", t("option.applyHuman"), t("option.applyHuman.desc"), plan)],
    source: src.kind === "llm" ? src : { kind: "rules" }
  };
}

/** Apply without authority checks; only used to discover which constraint a plan would break. */
function applyPatchUnchecked(score: PerformanceScore, patch: ScorePatch): PerformanceScore {
  const withoutConstraints: PerformanceScore = { ...structuredClone(score), constraints: [] };
  const r = applyPatch(withoutConstraints, patch, { actor: "human", humanApproved: true });
  return r.ok ? { ...r.score, constraints: score.constraints } : score;
}

/**
 * "Ask for a combined version". Climax: half the hold, everything else as the
 * human asked. Other scenarios: the rule's middle ground (rules only).
 */
export function addCombinedOption(round: NegotiationRound, score: PerformanceScore, advice?: DirectorAdvice | null): NegotiationRound {
  if (!round.canCombine || round.options.some((o) => o.id === "combined")) return round;
  if (round.request.kind !== "climax-burst") {
    const combined = ruleProposal(round.request.kind, score)?.combined;
    if (!combined) return round;
    return { ...round, canCombine: false, options: [...round.options, option(score, "combined", t("option.combined"), combined.description, combined.patch)] };
  }
  const human = round.options.find((o) => o.id === "human");
  const ai = round.options.find((o) => o.id === "ai");
  if (!human?.patch || !ai?.patch) return round;
  const aiHold = ai.patch.ops.find((o) => o.op === "setRelease");
  const fromAdvice = advice?.counter?.holdBeats;
  const hold = Math.max(2, Math.min(fromAdvice ?? Math.round((aiHold && aiHold.op === "setRelease" ? aiHold.holdBeats : 8) / 2), 8));
  const patch: ScorePatch = {
    ops: human.patch.ops.map((op) => (op.op === "setRelease" ? { ...op, mode: "held", holdBeats: hold } : op))
  };
  const description = advice?.source.kind === "llm" && advice.rationale ? literal(advice.rationale) : t("option.combined.desc", { beats: hold });
  return {
    ...round,
    canCombine: false,
    options: [...round.options, option(score, "combined", t("option.combined"), description, patch)]
  };
}

export type ResolveResult =
  | { ok: true; round: NegotiationRound; score: PerformanceScore; memory: CreativeMemory }
  | { ok: false; error: Text };

/** Apply the option a human picked. This is the only path from negotiation to the score. */
export function resolveRound(round: NegotiationRound, optionId: OptionId, score: PerformanceScore, memory: CreativeMemory): ResolveResult {
  if (round.status !== "open") return { ok: false, error: t("negotiate.error.closed") };
  const opt = round.options.find((o) => o.id === optionId);
  if (!opt) return { ok: false, error: t("negotiate.error.noOption") };
  let next = score;
  let changes: FieldChange[] = [];
  if (opt.patch) {
    const r = applyPatch(score, opt.patch, { actor: "human", humanApproved: true });
    if (!r.ok) return { ok: false, error: t("negotiate.error.rejected", { code: r.rejected[0]?.code ?? "unknown" }) };
    next = r.score;
    changes = r.changes;
  }
  const directorObjected = round.kind === "proposal";
  const entry: MemoryEntry = { topic: round.topic, roundId: round.id, chosen: optionId, directorObjected };
  return {
    ok: true,
    round: { ...round, status: "resolved", resolution: { optionId, changes } },
    score: next,
    memory: { entries: [...memory.entries, entry] }
  };
}
