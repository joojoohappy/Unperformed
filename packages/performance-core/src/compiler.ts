/**
 * Scene compiler: Interpretation -> PerformanceScore.
 *
 * Deterministic. Given the same interpretation, duration and seed it always
 * produces the same score. Routine staging choices (camera moves, light wash)
 * are made here by the co-director's *rule-based* local policy and returned as
 * explicit, reviewable decisions — they are within the AI's authority but are
 * still recorded so a human can see and override them.
 */
import type { Interpretation, InterpretedPhase } from "./interpretation";
import {
  type Archetype,
  type CameraMove,
  type Constraint,
  type Mood,
  type PerformanceScore,
  type Section,
  type TransitionType,
  SCHEMA_VERSION,
  validateScore
} from "./schema";
import { type Text, t } from "./text";
import { round3 } from "./util";

export interface LocalDecision {
  sectionId: string;
  field: string;
  value: string | number;
  reason: Text;
}

export interface CompileOptions {
  durationSec: number;
  seed: number;
}

export interface CompileResult {
  score: PerformanceScore;
  localDecisions: LocalDecision[];
}

const ROOT_BY_MOOD: Record<Mood, number> = {
  serene: 48,
  tense: 45,
  melancholic: 45,
  euphoric: 50,
  ominous: 41,
  tender: 48,
  defiant: 43
};

const WASH_BY_MOOD: Record<Mood, "cold" | "neutral" | "warm"> = {
  serene: "cold",
  tense: "cold",
  melancholic: "cold",
  euphoric: "warm",
  ominous: "neutral",
  tender: "warm",
  defiant: "neutral"
};

const ORDER_BY_ARCHETYPE: Record<Archetype, number> = {
  order: 1,
  build: 0.8,
  fracture: 0.3,
  climax: 0.05,
  release: 0.45,
  silence: 0.6,
  drift: 0.5
};

const PITCH_BY_ARCHETYPE: Record<Archetype, number> = {
  order: 0,
  build: 5,
  fracture: 6,
  climax: 7,
  release: 0,
  silence: 0,
  drift: -5
};

const FLICKER_BY_ARCHETYPE: Record<Archetype, number> = {
  order: 0,
  build: 0.05,
  fracture: 0.3,
  climax: 0.35,
  release: 0.05,
  silence: 0,
  drift: 0.05
};

/** Split `bars` across weighted phases with a minimum per phase (largest remainder method). */
export function allocateBars(weights: number[], bars: number): number[] {
  const n = weights.length;
  const minBars = bars >= n * 2 ? 2 : 1;
  const free = bars - minBars * n;
  if (free < 0) throw new Error(`cannot fit ${n} phases into ${bars} bars`);
  const total = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((w) => (w / total) * free);
  const out = exact.map((e) => minBars + Math.floor(e));
  let remaining = bars - out.reduce((a, b) => a + b, 0);
  const order = exact
    .map((e, i) => ({ i, r: e - Math.floor(e) }))
    .sort((a, b) => b.r - a.r || a.i - b.i);
  for (let k = 0; remaining > 0; k = (k + 1) % n, remaining--) {
    const idx = order[k]!.i;
    out[idx] = out[idx]! + 1;
  }
  return out;
}

/** Rule-based camera policy: follows energy and archetype, avoids repeating a move back-to-back. */
export function chooseCamera(phase: InterpretedPhase, previous: CameraMove | null): { move: CameraMove; speed: number; reason: Text } {
  const avg = (phase.energyFrom + phase.energyTo) / 2;
  let move: CameraMove;
  let reasonKey: string;
  switch (phase.archetype) {
    case "order":
      move = "push-in";
      reasonKey = "decision.camera.order";
      break;
    case "build":
      move = avg > 0.5 ? "orbit" : "push-in";
      reasonKey = "decision.camera.build";
      break;
    case "fracture":
      move = "tremor";
      reasonKey = "decision.camera.fracture";
      break;
    case "climax":
      move = "orbit";
      reasonKey = "decision.camera.climax";
      break;
    case "release":
      move = "pull-back";
      reasonKey = "decision.camera.release";
      break;
    case "silence":
      move = "static";
      reasonKey = "decision.camera.silence";
      break;
    default:
      move = "drift";
      reasonKey = "decision.camera.drift";
  }
  if (move === previous && move !== "static") {
    move = move === "orbit" ? "drift" : "orbit";
    reasonKey = "decision.camera.variety";
  }
  const speed = round3(phase.archetype === "silence" ? 0 : 0.25 + avg * 0.6);
  return { move, speed, reason: t(reasonKey, { move }) };
}

function transitionFor(prev: InterpretedPhase | null, phase: InterpretedPhase): { type: TransitionType; beats: number } {
  if (!prev) return { type: "fade", beats: 4 };
  if (phase.archetype === "silence") return { type: "fade", beats: 4 };
  if (phase.archetype === "climax") return { type: "cut", beats: 0 };
  if (phase.archetype === "fracture") return { type: "dissolve", beats: 2 };
  return { type: "dissolve", beats: 4 };
}

export function compile(interp: Interpretation, opts: CompileOptions): CompileResult {
  const beatsPerBar = 4;
  const rawBeats = Math.round((opts.durationSec * interp.tempoBpm) / 60);
  const bars = Math.max(interp.phases.length, Math.round(rawBeats / beatsPerBar));
  const barSplit = allocateBars(
    interp.phases.map((p) => p.weight),
    bars
  );

  const localDecisions: LocalDecision[] = [];
  const sections: Section[] = [];
  let cursor = 0;
  let prevCamera: CameraMove | null = null;
  const wash = WASH_BY_MOOD[interp.mood];

  interp.phases.forEach((phase, i) => {
    const id = `s${i + 1}`;
    const lengthBeats = barSplit[i]! * beatsPerBar;
    const isClimax = interp.climax?.phaseIndex === i;
    const cam = chooseCamera(phase, prevCamera);
    prevCamera = cam.move;
    localDecisions.push({ sectionId: id, field: "camera.move", value: cam.move, reason: cam.reason });

    const key =
      phase.archetype === "climax"
        ? interp.palette.climax
        : phase.archetype === "fracture"
          ? interp.palette.accent
          : interp.palette.base;
    const peak = Math.max(phase.energyFrom, phase.energyTo);
    const silence = phase.archetype === "silence" || phase.sound === "silence";
    const intensity = round3(silence ? Math.min(0.08, 0.02 + phase.energyTo * 0.1) : 0.25 + peak * 0.75);

    const section: Section = {
      id,
      name: phase.name,
      archetype: phase.archetype,
      startBeat: cursor,
      lengthBeats,
      energy: {
        from: round3(phase.energyFrom),
        to: round3(silence ? Math.min(phase.energyTo, 0.02) : phase.energyTo),
        curve: phase.archetype === "build" ? "ease-in" : phase.archetype === "release" || silence ? "ease-out" : "linear"
      },
      lighting: {
        key,
        accent: interp.palette.accent,
        intensity,
        wash,
        flicker: FLICKER_BY_ARCHETYPE[phase.archetype]
      },
      camera: { move: cam.move, speed: cam.speed },
      geometry: {
        form: phase.geometry,
        order: ORDER_BY_ARCHETYPE[phase.archetype],
        density: round3(silence ? 0.15 : 0.35 + peak * 0.6)
      },
      sound: {
        texture: silence ? "silence" : phase.sound,
        level: round3(silence ? 0 : 0.3 + peak * 0.6),
        pulseEvery: phase.archetype === "order" ? 4 : phase.archetype === "build" ? 2 : phase.archetype === "fracture" || phase.archetype === "climax" ? 1 : 4,
        pitch: PITCH_BY_ARCHETYPE[phase.archetype]
      },
      transition: transitionFor(interp.phases[i - 1] ?? null, phase)
    };
    if (isClimax && interp.climax) {
      section.release = {
        mode: interp.climax.release,
        holdBeats: Math.min(interp.climax.holdBeats, lengthBeats - 4)
      };
    }
    if (i === 0) {
      localDecisions.push({ sectionId: id, field: "lighting.wash", value: wash, reason: t("decision.wash", { mood: interp.mood, wash }) });
    }
    sections.push(section);
    cursor += lengthBeats;
  });

  const constraints: Constraint[] = interp.constraints.map((c, i) => ({
    id: `c${i + 1}`,
    kind: c.kind,
    text: c.text,
    ...(c.value != null ? { value: c.value } : {}),
    status: "proposed",
    owner: "human"
  }));

  const score: PerformanceScore = {
    schemaVersion: SCHEMA_VERSION,
    title: interp.title,
    summary: interp.summary,
    mood: interp.mood,
    tempoBpm: interp.tempoBpm,
    rootNote: ROOT_BY_MOOD[interp.mood],
    seed: opts.seed,
    totalBeats: cursor,
    palette: interp.palette,
    sections,
    constraints,
    humanLocked: []
  };

  const v = validateScore(score);
  if (!v.ok) throw new Error(`compiler produced an invalid score: ${v.errors.join("; ")}`);
  return { score: v.value, localDecisions };
}
