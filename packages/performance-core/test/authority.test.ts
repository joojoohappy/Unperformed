import { describe, expect, it } from "vitest";
import { applyPatch, authorityOf, climaxSection, type ScorePatch } from "../src";
import { approvedScore, baseScore } from "./helpers";

describe("authority policy (deterministic, not prompt-based)", () => {
  it("lets the AI make routine camera changes on its own", () => {
    const s = baseScore();
    const r = applyPatch(s, { ops: [{ op: "setCamera", sectionId: "s1", move: "drift" }] }, { actor: "ai", humanApproved: false });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.score.humanLocked).toEqual([]); // AI changes do not lock anything
  });

  it("refuses AI changes to the climax without human approval", () => {
    const s = baseScore();
    const climax = climaxSection(s)!;
    const patch: ScorePatch = { ops: [{ op: "setRelease", sectionId: climax.id, mode: "immediate", holdBeats: 0 }] };
    expect(authorityOf(patch.ops[0]!, s)).toBe("shared");
    const r = applyPatch(s, patch, { actor: "ai", humanApproved: false });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejected[0]!.code).toBe("needs-approval");
    expect(applyPatch(s, patch, { actor: "ai", humanApproved: true }).ok).toBe(true);
  });

  it("never lets the AI touch human-level decisions, even with approval flags", () => {
    const s = approvedScore();
    for (const patch of [
      { ops: [{ op: "removeConstraint" as const, constraintId: "c1" }] },
      { ops: [{ op: "setConstraintStatus" as const, constraintId: "c1", status: "proposed" as const }] }
    ]) {
      const r = applyPatch(s, patch, { actor: "ai", humanApproved: false });
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.rejected[0]!.code).toBe("human-only");
    }
  });

  it("classifies large lighting jumps as shared, small ones as AI-authorized", () => {
    const s = baseScore();
    const sec = s.sections[1]!;
    expect(authorityOf({ op: "setLighting", sectionId: sec.id, intensity: sec.lighting.intensity + 0.1 }, s)).toBe("ai");
    expect(authorityOf({ op: "setLighting", sectionId: sec.id, intensity: Math.min(1, sec.lighting.intensity + 0.4) }, s)).toBe("shared");
    expect(authorityOf({ op: "setLighting", sectionId: sec.id, key: "#ff0000" }, s)).toBe("shared");
  });

  it("locks fields a human edits; the AI can no longer change them", () => {
    const s = baseScore();
    const human = applyPatch(s, { ops: [{ op: "setCamera", sectionId: "s2", move: "static" }] }, { actor: "human", humanApproved: true });
    expect(human.ok).toBe(true);
    if (!human.ok) return;
    expect(human.score.humanLocked).toContain("s2.camera.move");
    const ai = applyPatch(human.score, { ops: [{ op: "setCamera", sectionId: "s2", move: "orbit" }] }, { actor: "ai", humanApproved: false });
    expect(ai.ok).toBe(false);
    if (!ai.ok) expect(ai.rejected).toContainEqual({ code: "human-locked", path: "s2.camera.move" });
    // Unlocked sibling fields remain available to the AI.
    expect(applyPatch(human.score, { ops: [{ op: "setCamera", sectionId: "s2", speed: 0.3 }] }, { actor: "ai", humanApproved: false }).ok).toBe(true);
  });

  it("preserves approved constraints against everyone, humans included", () => {
    const s = approvedScore();
    const last = s.sections[s.sections.length - 1]!;
    const loud: ScorePatch = { ops: [{ op: "setSound", sectionId: last.id, texture: "swell", level: 1 }] };
    const r = applyPatch(s, loud, { actor: "human", humanApproved: true });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.rejected[0]).toMatchObject({ code: "violates-constraint", constraintId: "c1" });
    // A human can break it only by explicitly removing the constraint in the same patch.
    const explicit = applyPatch(s, { ops: [{ op: "removeConstraint", constraintId: "c1" }, ...loud.ops] }, { actor: "human", humanApproved: true });
    expect(explicit.ok).toBe(true);
  });

  it("does not enforce constraints that are only proposed", () => {
    const s = baseScore();
    const last = s.sections[s.sections.length - 1]!;
    expect(applyPatch(s, { ops: [{ op: "setSound", sectionId: last.id, texture: "swell" }] }, { actor: "human", humanApproved: true }).ok).toBe(true);
  });

  it("is all-or-nothing", () => {
    const s = baseScore();
    const r = applyPatch(
      s,
      { ops: [{ op: "setCamera", sectionId: "s1", move: "drift" }, { op: "setPalette", base: "#000000" }] },
      { actor: "ai", humanApproved: false }
    );
    expect(r.ok).toBe(false);
    expect(r.score).toBe(s);
  });

  it("rejects structurally invalid patches and unknown sections", () => {
    const s = baseScore();
    const bad = applyPatch(s, { ops: [{ op: "setCamera", sectionId: "s1", move: "teleport" }] } as unknown as ScorePatch, { actor: "human", humanApproved: true });
    expect(bad.ok).toBe(false);
    const missing = applyPatch(s, { ops: [{ op: "setCamera", sectionId: "s99", move: "drift" }] }, { actor: "human", humanApproved: true });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.rejected[0]!.code).toBe("unknown-section");
  });
});
