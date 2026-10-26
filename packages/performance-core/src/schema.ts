/**
 * The Performance Score: the single machine-readable contract between the
 * creative workflow (human + AI co-director) and the real-time engine.
 *
 * Everything the stage can do is expressed through these enums and bounded
 * numbers. Nothing in a score is executable code, so an LLM can propose a
 * score change but can never inject behaviour into the renderer.
 */
import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

export const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "expected #rrggbb colour");
const unit = z.number().min(0).max(1);

export const MOODS = ["serene", "tense", "melancholic", "euphoric", "ominous", "tender", "defiant"] as const;
export const ARCHETYPES = ["order", "build", "fracture", "climax", "release", "silence", "drift"] as const;
export const GEOMETRY_FORMS = ["grid", "lattice", "shards", "ring", "dust", "void", "monolith"] as const;
export const SOUND_TEXTURES = ["drone", "pulse", "noise", "swell", "silence"] as const;
export const CAMERA_MOVES = ["static", "push-in", "pull-back", "orbit", "drift", "tremor"] as const;
export const TRANSITIONS = ["cut", "fade", "dissolve", "blackout"] as const;
export const ENERGY_CURVES = ["linear", "ease-in", "ease-out", "step"] as const;
export const WASHES = ["cold", "neutral", "warm"] as const;
export const RELEASE_MODES = ["immediate", "held", "staggered"] as const;
export const CONSTRAINT_KINDS = [
  "ending-silence",
  "opening-order",
  "no-strobe",
  "max-energy",
  "keep-climax"
] as const;

export const Mood = z.enum(MOODS);
export const Archetype = z.enum(ARCHETYPES);
export const GeometryForm = z.enum(GEOMETRY_FORMS);
export const SoundTexture = z.enum(SOUND_TEXTURES);
export const CameraMove = z.enum(CAMERA_MOVES);
export const TransitionType = z.enum(TRANSITIONS);
export const EnergyCurve = z.enum(ENERGY_CURVES);
export const Wash = z.enum(WASHES);
export const ReleaseMode = z.enum(RELEASE_MODES);
export const ConstraintKind = z.enum(CONSTRAINT_KINDS);

/** Hard safety ceiling for light modulation, in Hz. WCAG 2.3.1 allows at most 3 flashes/s. */
export const MAX_FLICKER_HZ = 2;

export const Palette = z.object({
  base: hexColor,
  accent: hexColor,
  climax: hexColor
});

export const Section = z.object({
  id: z.string().regex(/^s[0-9]+$/),
  name: z.string().min(1).max(48),
  /** One line on what happens in this section, shown on stage as a caption. */
  note: z.string().max(160).optional(),
  archetype: Archetype,
  startBeat: z.number().int().min(0),
  lengthBeats: z.number().int().min(4).max(256),
  energy: z.object({ from: unit, to: unit, curve: EnergyCurve }),
  lighting: z.object({
    key: hexColor,
    accent: hexColor,
    intensity: unit,
    wash: Wash,
    /** 0..1 amount of slow light modulation. Frequency is capped by the engine at MAX_FLICKER_HZ. */
    flicker: unit
  }),
  camera: z.object({ move: CameraMove, speed: unit }),
  geometry: z.object({
    form: GeometryForm,
    /** 1 = perfect alignment, 0 = full disorder. */
    order: unit,
    density: unit
  }),
  sound: z.object({
    texture: SoundTexture,
    level: unit,
    /** Pulse every N beats (only used by the "pulse" texture). */
    pulseEvery: z.union([z.literal(1), z.literal(2), z.literal(4)]),
    /** Semitone offset from the score's root note. */
    pitch: z.number().int().min(-12).max(12)
  }),
  transition: z.object({ type: TransitionType, beats: z.number().int().min(0).max(8) }),
  release: z
    .object({ mode: ReleaseMode, holdBeats: z.number().int().min(0).max(16) })
    .optional()
});

export const Constraint = z.object({
  id: z.string().min(1).max(40),
  kind: ConstraintKind,
  /** Human-readable statement, in the language it was written in. */
  text: z.string().min(1).max(160),
  value: z.number().min(0).max(1).optional(),
  /** "proposed" constraints were inferred by the director and are not binding until a human approves them. */
  status: z.enum(["proposed", "approved"]),
  owner: z.literal("human")
});

export const PerformanceScore = z
  .object({
    schemaVersion: z.literal(SCHEMA_VERSION),
    title: z.string().min(1).max(80),
    summary: z.string().max(400),
    mood: Mood,
    tempoBpm: z.number().int().min(60).max(160),
    /** Root note as MIDI number; procedural audio is tuned around it. */
    rootNote: z.number().int().min(36).max(60),
    seed: z.number().int().min(0).max(2 ** 31 - 1),
    totalBeats: z.number().int().min(16).max(512),
    palette: Palette,
    sections: z.array(Section).min(2).max(8),
    constraints: z.array(Constraint).max(12),
    /**
     * Field paths ("s3.camera.move") a human has set directly. The authority
     * policy forbids the AI from changing them.
     */
    humanLocked: z.array(z.string()).max(200)
  })
  .superRefine((score, ctx) => {
    const ids = new Set<string>();
    let cursor = 0;
    score.sections.forEach((s, i) => {
      if (ids.has(s.id)) ctx.addIssue({ code: "custom", path: ["sections", i, "id"], message: `duplicate section id ${s.id}` });
      ids.add(s.id);
      if (s.startBeat !== cursor) {
        ctx.addIssue({ code: "custom", path: ["sections", i, "startBeat"], message: `section ${s.id} starts at ${s.startBeat}, expected ${cursor}` });
      }
      cursor = s.startBeat + s.lengthBeats;
      if (s.release && s.archetype !== "climax") {
        ctx.addIssue({ code: "custom", path: ["sections", i, "release"], message: "only climax sections may define a release" });
      }
      if (s.release && s.release.holdBeats >= s.lengthBeats) {
        ctx.addIssue({ code: "custom", path: ["sections", i, "release", "holdBeats"], message: "hold must be shorter than the section" });
      }
    });
    if (cursor !== score.totalBeats) {
      ctx.addIssue({ code: "custom", path: ["totalBeats"], message: `sections cover ${cursor} beats but totalBeats is ${score.totalBeats}` });
    }
    const cids = new Set<string>();
    score.constraints.forEach((c, i) => {
      if (cids.has(c.id)) ctx.addIssue({ code: "custom", path: ["constraints", i, "id"], message: `duplicate constraint id ${c.id}` });
      cids.add(c.id);
    });
  });

export type Palette = z.infer<typeof Palette>;
export type Section = z.infer<typeof Section>;
export type Constraint = z.infer<typeof Constraint>;
export type PerformanceScore = z.infer<typeof PerformanceScore>;
export type Archetype = z.infer<typeof Archetype>;
export type GeometryForm = z.infer<typeof GeometryForm>;
export type SoundTexture = z.infer<typeof SoundTexture>;
export type CameraMove = z.infer<typeof CameraMove>;
export type TransitionType = z.infer<typeof TransitionType>;
export type Mood = z.infer<typeof Mood>;
export type ReleaseMode = z.infer<typeof ReleaseMode>;
export type ConstraintKind = z.infer<typeof ConstraintKind>;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: string[] };

function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
}

export function validateScore(input: unknown): ValidationResult<PerformanceScore> {
  const r = PerformanceScore.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, errors: formatIssues(r.error) };
}

export function validateWith<T>(schema: z.ZodType<T>, input: unknown): ValidationResult<T> {
  const r = schema.safeParse(input);
  return r.success ? { ok: true, value: r.data } : { ok: false, errors: formatIssues(r.error) };
}

export function secondsPerBeat(score: Pick<PerformanceScore, "tempoBpm">): number {
  return 60 / score.tempoBpm;
}

export function durationSeconds(score: Pick<PerformanceScore, "tempoBpm" | "totalBeats">): number {
  return score.totalBeats * secondsPerBeat(score);
}

export function findSection(score: PerformanceScore, id: string): Section | undefined {
  return score.sections.find((s) => s.id === id);
}

export function climaxSection(score: PerformanceScore): Section | undefined {
  return score.sections.find((s) => s.archetype === "climax");
}
