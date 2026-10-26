/**
 * Deterministic checks for human creative constraints.
 *
 * Constraints are stated in words by people ("ends in complete silence") but
 * each kind maps to a precise, testable predicate on the score. Only approved
 * constraints are binding; proposed ones are reported as warnings.
 */
import type { Constraint, PerformanceScore } from "./schema";

export interface ConstraintViolation {
  constraintId: string;
  kind: Constraint["kind"];
  detail: string;
}

export function checkConstraint(score: PerformanceScore, c: Constraint): string | null {
  const first = score.sections[0];
  const last = score.sections[score.sections.length - 1];
  switch (c.kind) {
    case "ending-silence":
      if (!last) return "score has no sections";
      if (last.sound.texture !== "silence") return `final section ${last.id} has sound texture "${last.sound.texture}"`;
      if (last.energy.to > 0.05) return `final section ${last.id} ends at energy ${last.energy.to}`;
      if (last.lighting.intensity > 0.1) return `final section ${last.id} has light intensity ${last.lighting.intensity}`;
      return null;
    case "opening-order":
      if (!first) return "score has no sections";
      if (first.geometry.order < 0.9) return `opening section ${first.id} has order ${first.geometry.order}`;
      if (first.camera.move === "tremor") return `opening section ${first.id} uses a tremor camera`;
      return null;
    case "no-strobe": {
      const s = score.sections.find((x) => x.lighting.flicker > 0.15);
      return s ? `section ${s.id} has light flicker ${s.lighting.flicker}` : null;
    }
    case "max-energy": {
      const cap = c.value ?? 1;
      const s = score.sections.find((x) => Math.max(x.energy.from, x.energy.to) > cap);
      return s ? `section ${s.id} exceeds the energy cap ${cap}` : null;
    }
    case "keep-climax":
      return score.sections.some((s) => s.archetype === "climax") ? null : "the score no longer has a climax";
  }
}

export function violations(score: PerformanceScore, opts: { includeProposed?: boolean } = {}): ConstraintViolation[] {
  const out: ConstraintViolation[] = [];
  for (const c of score.constraints) {
    if (c.status !== "approved" && !opts.includeProposed) continue;
    const detail = checkConstraint(score, c);
    if (detail) out.push({ constraintId: c.id, kind: c.kind, detail });
  }
  return out;
}
