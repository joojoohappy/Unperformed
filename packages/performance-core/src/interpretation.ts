/**
 * Creative Interpretation: the compact, structured reading of a human's idea.
 *
 * In Live AI mode an LLM produces this object (validated on the server with
 * Pydantic and again here with zod). In Demo mode the deterministic rule-based
 * planner produces it. Either way, the deterministic compiler turns it into a
 * full PerformanceScore, so the model never writes the score directly.
 */
import { z } from "zod";
import { REQUEST_KINDS } from "./negotiation";
import { Archetype, ConstraintKind, GeometryForm, Mood, Palette, ReleaseMode, SoundTexture } from "./schema";
import { StageSet } from "./stageSet";

const unit = z.number().min(0).max(1);

export const InterpretedPhase = z.object({
  name: z.string().min(1).max(48),
  archetype: Archetype,
  /** Relative length, 1..5. */
  weight: z.number().int().min(1).max(5),
  energyFrom: unit,
  energyTo: unit,
  geometry: GeometryForm,
  sound: SoundTexture,
  note: z.string().max(160)
}).strict();

export const Interpretation = z
  .object({
    title: z.string().min(1).max(80),
    summary: z.string().min(1).max(400),
    /** Short statements of what was understood, shown to the human before composing. */
    understood: z.array(z.string().min(1).max(160)).min(1).max(5),
    mood: Mood,
    palette: Palette,
    /** Set pieces for this idea; more described, more pieces. */
    set: StageSet,
    tempoBpm: z.number().int().min(60).max(160),
    phases: z.array(InterpretedPhase).min(3).max(6),
    climax: z
      .object({
        phaseIndex: z.number().int().min(0).max(5),
        release: ReleaseMode,
        holdBeats: z.number().int().min(0).max(16)
      })
      .nullable(),
    constraints: z
      .array(z.object({ kind: ConstraintKind, text: z.string().min(1).max(160), value: unit.nullish() }).strict())
      .max(4),
    /** One sentence describing the co-director's artistic strategy for this piece. */
    strategy: z.string().min(1).max(240)
  })
  .strict()
  .superRefine((it, ctx) => {
    if (it.climax) {
      const phase = it.phases[it.climax.phaseIndex];
      if (!phase) ctx.addIssue({ code: "custom", path: ["climax", "phaseIndex"], message: "climax phase index out of range" });
      else if (phase.archetype !== "climax") {
        ctx.addIssue({ code: "custom", path: ["climax", "phaseIndex"], message: "climax.phaseIndex must point to a phase with archetype 'climax'" });
      }
    }
    const climaxCount = it.phases.filter((p) => p.archetype === "climax").length;
    if (climaxCount > 1) ctx.addIssue({ code: "custom", path: ["phases"], message: "at most one climax phase" });
    if (climaxCount === 1 && !it.climax) ctx.addIssue({ code: "custom", path: ["climax"], message: "climax details required when a climax phase exists" });
  });

export type InterpretedPhase = z.infer<typeof InterpretedPhase>;
export type Interpretation = z.infer<typeof Interpretation>;

/** Live AI: the model's reading of a change request. Mirrors services/ai RequestAnalysis. */
export const RequestAnalysis = z
  .object({
    kind: z.enum(REQUEST_KINDS),
    creativeDifference: z.boolean(),
    rationale: z.string().max(280),
    /** Climax only. For other kinds the rules compute the counter and the model only phrases it. */
    counter: z.object({ releaseMode: z.enum(["held", "staggered"]), holdBeats: z.number().int().min(0).max(16) }).strict().nullable()
  })
  .strict();
export type RequestAnalysis = z.infer<typeof RequestAnalysis>;

/** Live AI: a combined proposal. Mirrors services/ai CombinedAdvice. */
export const CombinedAdvice = z.object({ holdBeats: z.number().int().min(2).max(8), rationale: z.string().min(1).max(280) }).strict();
export type CombinedAdvice = z.infer<typeof CombinedAdvice>;

/** Metadata the Live AI service reports for each model call. */
export const CallMeta = z.object({
  provider: z.string(),
  model: z.string(),
  latencyMs: z.number(),
  attempts: z.number().int(),
  inputTokens: z.number().int(),
  outputTokens: z.number().int(),
  estimatedCostUsd: z.number().nullable()
});
export type CallMeta = z.infer<typeof CallMeta>;
