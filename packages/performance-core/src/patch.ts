/**
 * Score patches and the authority policy.
 *
 * Every change to a score — a human edit in rehearsal, an outcome of
 * negotiation, a routine AI staging choice — is a typed patch. `applyPatch`
 * is the single gate where authority is enforced. The policy lives here, in
 * deterministic code, not in a model prompt.
 */
import { z } from "zod";
import { violations } from "./constraints";
import {
  CameraMove,
  Constraint,
  EnergyCurve,
  GeometryForm,
  type PerformanceScore,
  ReleaseMode,
  SoundTexture,
  TransitionType,
  Wash,
  hexColor,
  validateScore
} from "./schema";

const unit = z.number().min(0).max(1);
const sectionId = z.string().regex(/^s[0-9]+$/);

export const PatchOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("setRelease"), sectionId, mode: ReleaseMode, holdBeats: z.number().int().min(0).max(16) }),
  z.object({ op: z.literal("setEnergy"), sectionId, from: unit.optional(), to: unit.optional(), curve: EnergyCurve.optional() }),
  z.object({
    op: z.literal("setLighting"),
    sectionId,
    intensity: unit.optional(),
    key: hexColor.optional(),
    accent: hexColor.optional(),
    wash: Wash.optional(),
    flicker: unit.optional()
  }),
  z.object({ op: z.literal("setCamera"), sectionId, move: CameraMove.optional(), speed: unit.optional() }),
  z.object({ op: z.literal("setGeometry"), sectionId, form: GeometryForm.optional(), order: unit.optional(), density: unit.optional() }),
  z.object({ op: z.literal("setSound"), sectionId, texture: SoundTexture.optional(), level: unit.optional() }),
  z.object({ op: z.literal("setTransition"), sectionId, type: TransitionType.optional(), beats: z.number().int().min(0).max(8).optional() }),
  z.object({ op: z.literal("setPalette"), base: hexColor.optional(), accent: hexColor.optional(), climax: hexColor.optional() }),
  z.object({ op: z.literal("addConstraint"), constraint: Constraint }),
  z.object({ op: z.literal("setConstraintStatus"), constraintId: z.string(), status: z.enum(["proposed", "approved"]) }),
  z.object({ op: z.literal("removeConstraint"), constraintId: z.string() })
]);
export type PatchOp = z.infer<typeof PatchOp>;
export const ScorePatch = z.object({ ops: z.array(PatchOp).min(1).max(40) });
export type ScorePatch = z.infer<typeof ScorePatch>;

/**
 * - `ai`: routine staging the co-director may change on its own.
 * - `shared`: meaningful creative changes; need explicit human approval.
 * - `human`: intent-level decisions only a human can make.
 */
export type AuthorityLevel = "ai" | "shared" | "human";

export type Actor = "human" | "ai";

export interface ApplyContext {
  actor: Actor;
  /** True when a human explicitly approved this patch (e.g. picked it in a negotiation). */
  humanApproved: boolean;
}

export type RejectReason =
  | { code: "human-only"; op: PatchOp["op"] }
  | { code: "needs-approval"; op: PatchOp["op"]; sectionId?: string }
  | { code: "human-locked"; path: string }
  | { code: "unknown-section"; sectionId: string }
  | { code: "unknown-constraint"; constraintId: string }
  | { code: "violates-constraint"; constraintId: string; detail: string }
  | { code: "invalid-score"; errors: string[] };

export interface FieldChange {
  path: string;
  before: unknown;
  after: unknown;
}

export type ApplyResult =
  | { ok: true; score: PerformanceScore; changes: FieldChange[] }
  | { ok: false; score: PerformanceScore; rejected: RejectReason[] };

/** Field paths a patch op writes, e.g. "s3.camera.move". */
export function touchedPaths(op: PatchOp): string[] {
  const keys = (obj: Record<string, unknown>, exclude: string[]) =>
    Object.keys(obj).filter((k) => !exclude.includes(k) && obj[k] !== undefined);
  switch (op.op) {
    case "setRelease":
      return [`${op.sectionId}.release`];
    case "setEnergy":
      return keys(op, ["op", "sectionId"]).map((k) => `${op.sectionId}.energy.${k}`);
    case "setLighting":
      return keys(op, ["op", "sectionId"]).map((k) => `${op.sectionId}.lighting.${k}`);
    case "setCamera":
      return keys(op, ["op", "sectionId"]).map((k) => `${op.sectionId}.camera.${k}`);
    case "setGeometry":
      return keys(op, ["op", "sectionId"]).map((k) => `${op.sectionId}.geometry.${k}`);
    case "setSound":
      return keys(op, ["op", "sectionId"]).map((k) => `${op.sectionId}.sound.${k}`);
    case "setTransition":
      return keys(op, ["op", "sectionId"]).map((k) => `${op.sectionId}.transition.${k}`);
    case "setPalette":
      return keys(op, ["op"]).map((k) => `palette.${k}`);
    case "addConstraint":
      return [`constraints.${op.constraint.id}`];
    case "setConstraintStatus":
    case "removeConstraint":
      return [`constraints.${op.constraintId}`];
  }
}

/** Classify a single op against the current score. */
export function authorityOf(op: PatchOp, score: PerformanceScore): AuthorityLevel {
  const section = "sectionId" in op ? score.sections.find((s) => s.id === op.sectionId) : undefined;
  const isClimax = section?.archetype === "climax";
  switch (op.op) {
    case "addConstraint":
    case "removeConstraint":
    case "setConstraintStatus":
      return "human";
    case "setRelease":
    case "setPalette":
      return "shared";
    case "setEnergy": {
      if (!section) return "shared";
      const delta = Math.max(Math.abs((op.from ?? section.energy.from) - section.energy.from), Math.abs((op.to ?? section.energy.to) - section.energy.to));
      // Small energy nudges are local staging; anything that reshapes the arc is shared.
      return delta > 0.15 || isClimax || op.curve !== undefined ? "shared" : "ai";
    }
    case "setGeometry":
      return op.form !== undefined || isClimax ? "shared" : "ai";
    case "setSound":
      return op.texture !== undefined || isClimax ? "shared" : "ai";
    case "setLighting": {
      if (!section) return "shared";
      if (isClimax || op.key !== undefined || op.accent !== undefined) return "shared";
      if (op.intensity !== undefined && Math.abs(op.intensity - section.lighting.intensity) > 0.2) return "shared";
      if (op.flicker !== undefined && op.flicker > section.lighting.flicker + 0.1) return "shared";
      return "ai";
    }
    case "setCamera":
      return "ai";
    case "setTransition":
      return isClimax ? "shared" : "ai";
  }
}

function mutate(score: PerformanceScore, op: PatchOp): RejectReason | null {
  if ("sectionId" in op) {
    const s = score.sections.find((x) => x.id === op.sectionId);
    if (!s) return { code: "unknown-section", sectionId: op.sectionId };
    switch (op.op) {
      case "setRelease":
        s.release = { mode: op.mode, holdBeats: op.holdBeats };
        break;
      case "setEnergy":
        if (op.from !== undefined) s.energy.from = op.from;
        if (op.to !== undefined) s.energy.to = op.to;
        if (op.curve !== undefined) s.energy.curve = op.curve;
        break;
      case "setLighting":
        if (op.intensity !== undefined) s.lighting.intensity = op.intensity;
        if (op.key !== undefined) s.lighting.key = op.key;
        if (op.accent !== undefined) s.lighting.accent = op.accent;
        if (op.wash !== undefined) s.lighting.wash = op.wash;
        if (op.flicker !== undefined) s.lighting.flicker = op.flicker;
        break;
      case "setCamera":
        if (op.move !== undefined) s.camera.move = op.move;
        if (op.speed !== undefined) s.camera.speed = op.speed;
        break;
      case "setGeometry":
        if (op.form !== undefined) s.geometry.form = op.form;
        if (op.order !== undefined) s.geometry.order = op.order;
        if (op.density !== undefined) s.geometry.density = op.density;
        break;
      case "setSound":
        if (op.texture !== undefined) s.sound.texture = op.texture;
        if (op.level !== undefined) s.sound.level = op.level;
        break;
      case "setTransition":
        if (op.type !== undefined) s.transition.type = op.type;
        if (op.beats !== undefined) s.transition.beats = op.beats;
        break;
    }
    return null;
  }
  switch (op.op) {
    case "setPalette":
      if (op.base) score.palette.base = op.base;
      if (op.accent) score.palette.accent = op.accent;
      if (op.climax) score.palette.climax = op.climax;
      return null;
    case "addConstraint":
      score.constraints = score.constraints.filter((c) => c.id !== op.constraint.id).concat(op.constraint);
      return null;
    case "setConstraintStatus": {
      const c = score.constraints.find((x) => x.id === op.constraintId);
      if (!c) return { code: "unknown-constraint", constraintId: op.constraintId };
      c.status = op.status;
      return null;
    }
    case "removeConstraint": {
      const before = score.constraints.length;
      score.constraints = score.constraints.filter((c) => c.id !== op.constraintId);
      return before === score.constraints.length ? { code: "unknown-constraint", constraintId: op.constraintId } : null;
    }
  }
  return null;
}

/** Flatten the editable parts of a score into path -> value pairs, for diffs. */
export function flatten(score: PerformanceScore): Map<string, unknown> {
  const out = new Map<string, unknown>();
  const walk = (prefix: string, v: unknown) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      for (const [k, x] of Object.entries(v)) walk(prefix ? `${prefix}.${k}` : k, x);
    } else out.set(prefix, v);
  };
  for (const s of score.sections) {
    const { id, startBeat: _s, lengthBeats: _l, ...rest } = s;
    walk(id, rest);
  }
  walk("palette", score.palette);
  for (const c of score.constraints) out.set(`constraints.${c.id}`, c.status);
  return out;
}

export function diffScores(a: PerformanceScore, b: PerformanceScore): FieldChange[] {
  const fa = flatten(a);
  const fb = flatten(b);
  const keys = new Set([...fa.keys(), ...fb.keys()]);
  const out: FieldChange[] = [];
  for (const k of keys) {
    const x = fa.get(k);
    const y = fb.get(k);
    if (JSON.stringify(x) !== JSON.stringify(y)) out.push({ path: k, before: x, after: y });
  }
  return out.sort((p, q) => p.path.localeCompare(q.path, "en", { numeric: true }));
}

/**
 * The authority gate. All-or-nothing: if any op is not allowed, nothing is applied.
 *
 * Rules, in order:
 * 1. Patch must be structurally valid.
 * 2. AI actors may never apply human-level ops.
 * 3. AI actors may apply shared ops only with explicit human approval.
 * 4. AI actors may never change a field a human set directly (humanLocked),
 *    unless that human approved this exact patch.
 * 5. The resulting score must be valid and must satisfy every approved
 *    constraint — whoever the actor is. A human who wants to break a
 *    constraint must first remove or un-approve it, in the same patch.
 * 6. Human-made and human-approved changes become humanLocked.
 */
export function applyPatch(score: PerformanceScore, patch: ScorePatch, ctx: ApplyContext): ApplyResult {
  const parsed = ScorePatch.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, score, rejected: [{ code: "invalid-score", errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) }] };
  }
  const rejected: RejectReason[] = [];
  if (ctx.actor === "ai") {
    for (const op of parsed.data.ops) {
      const level = authorityOf(op, score);
      if (level === "human") rejected.push({ code: "human-only", op: op.op });
      else if (level === "shared" && !ctx.humanApproved) {
        rejected.push({ code: "needs-approval", op: op.op, ...("sectionId" in op ? { sectionId: op.sectionId } : {}) });
      }
      if (!ctx.humanApproved) {
        for (const p of touchedPaths(op)) {
          if (score.humanLocked.some((l) => p === l || p.startsWith(`${l}.`))) rejected.push({ code: "human-locked", path: p });
        }
      }
    }
    if (rejected.length) return { ok: false, score, rejected };
  }

  const next: PerformanceScore = structuredClone(score);
  for (const op of parsed.data.ops) {
    const err = mutate(next, op);
    if (err) rejected.push(err);
  }
  if (rejected.length) return { ok: false, score, rejected };

  if (ctx.actor === "human" || ctx.humanApproved) {
    const locked = new Set(next.humanLocked);
    for (const op of parsed.data.ops) for (const p of touchedPaths(op)) if (!p.startsWith("constraints.")) locked.add(p);
    next.humanLocked = [...locked].sort();
  }

  const v = validateScore(next);
  if (!v.ok) return { ok: false, score, rejected: [{ code: "invalid-score", errors: v.errors }] };
  const broken = violations(v.value);
  if (broken.length) {
    return { ok: false, score, rejected: broken.map((b) => ({ code: "violates-constraint" as const, constraintId: b.constraintId, detail: b.detail })) };
  }
  return { ok: true, score: v.value, changes: diffScores(score, v.value).filter((c) => c.path !== "humanLocked") };
}

/** Dry-run a patch: what would change, and would it be allowed? */
export function previewPatch(score: PerformanceScore, patch: ScorePatch, ctx: ApplyContext): ApplyResult {
  return applyPatch(score, patch, ctx);
}
