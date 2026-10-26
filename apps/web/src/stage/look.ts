/**
 * Art direction per section type. Each archetype gets its own light, air and
 * motion; renderers read the blended look so a change of section type reads as
 * a change of scene, not just a change of colour.
 *
 * Pure and renderer-agnostic. Nothing here oscillates: the look only moves
 * when the timeline moves from one section type to the next, so brightness
 * still changes only as fast as the timeline allows (2 Hz / 30% cap).
 */
import type { Archetype, StageFrame } from "@unperformed/performance-core";

export interface Look {
  /** Fog density. */
  fog: number;
  /** Haze particle opacity multiplier. */
  haze: number;
  /** Haze vertical travel per beat: positive rises, negative falls. */
  hazeLift: number;
  /** Opacity of the visible light beam. */
  beam: number;
  /** Beam radius at the floor. */
  beamWidth: number;
  /** Key light sideways offset: off-axis light for broken sections. */
  keyX: number;
  /** Rim (accent) light multiplier. */
  rim: number;
  /** Element self-illumination multiplier. */
  glow: number;
  /** 0 = matte floor, 1 = wet, mirror-like floor. */
  gloss: number;
  /** How far element colour leans toward the accent colour. */
  accent: number;
  /** Element size multiplier. */
  scale: number;
  /** Opacity of the floor grid lines. */
  floorGrid: number;
  // Motion (layout), each 0..1 weight.
  /** Synchronised slow wave along the rows. */
  breathe: number;
  /** Elements rise from the floor with section progress, staggered. */
  lift: number;
  /** A fault line opens down the middle with section progress. */
  split: number;
  /** Radial expansion driven by energy. */
  burst: number;
  /** Elements settle downward with section progress. */
  sink: number;
  /** Elements gather toward a small point at centre stage. */
  gather: number;
  /** A slow horizontal current. */
  current: number;
}

export const LOOKS: Record<Archetype, Look> = {
  // Precise and cold: a narrow top light, a wet floor, a ruled grid.
  order: { fog: 0.035, haze: 0.35, hazeLift: 0.004, beam: 0.48, beamWidth: 1.4, keyX: 0, rim: 0.5, glow: 0.6, gloss: 0.9, accent: 0, scale: 1.15, floorGrid: 0.35, breathe: 1, lift: 0, split: 0, burst: 0, sink: 0, gather: 0, current: 0 },
  // Pressure gathering: haze rises, the beam opens, elements climb.
  build: { fog: 0.05, haze: 0.8, hazeLift: 0.02, beam: 0.6, beamWidth: 2.0, keyX: 0, rim: 1.1, glow: 1, gloss: 0.6, accent: 0.2, scale: 1.1, floorGrid: 0.08, breathe: 0.2, lift: 1, split: 0, burst: 0, sink: 0, gather: 0, current: 0 },
  // Broken: light from the side, hard contrast, a gap tearing open.
  fracture: { fog: 0.03, haze: 0.5, hazeLift: 0.006, beam: 0.36, beamWidth: 1.2, keyX: 3.2, rim: 1.6, glow: 1.2, gloss: 0.4, accent: 0.55, scale: 1, floorGrid: 0, breathe: 0, lift: 0, split: 1, burst: 0, sink: 0, gather: 0, current: 0 },
  // Everything at once: thick air, a wide beam, hot elements thrown outward.
  climax: { fog: 0.06, haze: 1.3, hazeLift: 0.03, beam: 0.9, beamWidth: 3.2, keyX: 0, rim: 1.5, glow: 1.6, gloss: 0.5, accent: 0.35, scale: 1.9, floorGrid: 0, breathe: 0, lift: 0, split: 0, burst: 1, sink: 0, gather: 0, current: 0 },
  // Afterglow: warm low haze, soft light, everything settling.
  release: { fog: 0.065, haze: 1, hazeLift: -0.012, beam: 0.42, beamWidth: 2.6, keyX: -0.8, rim: 0.6, glow: 0.8, gloss: 0.7, accent: 0.15, scale: 1.4, floorGrid: 0, breathe: 0, lift: 0, split: 0, burst: 0, sink: 1, gather: 0, current: 0 },
  // Almost nothing: one thin shaft of light and what is left in it.
  silence: { fog: 0.08, haze: 0.25, hazeLift: -0.002, beam: 1.1, beamWidth: 0.55, keyX: 0, rim: 0.1, glow: 0.4, gloss: 0.95, accent: 0, scale: 1, floorGrid: 0, breathe: 0, lift: 0, split: 0, burst: 0, sink: 0, gather: 1, current: 0 },
  // Weightless: deep fog, a broad soft beam, a slow current across the stage.
  drift: { fog: 0.075, haze: 0.9, hazeLift: 0.003, beam: 0.3, beamWidth: 3.6, keyX: 1.2, rim: 0.7, glow: 0.9, gloss: 0.5, accent: 0.25, scale: 1.6, floorGrid: 0, breathe: 0, lift: 0, split: 0, burst: 0, sink: 0, gather: 0, current: 1 }
};

const KEYS = Object.keys(LOOKS.order) as (keyof Look)[];

/** The look for this frame, blended between section types during a transition. */
export function lookFor(frame: StageFrame, out: Look = { ...LOOKS.order }): Look {
  const a = LOOKS[frame.look.from];
  const b = LOOKS[frame.look.to];
  const t = frame.look.mix;
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}
