/**
 * Effect capability registry and fallbacks.
 *
 * A renderer declares what it can draw. If a score asks for a form the
 * current renderer cannot provide (no WebGL, a low-power device, or a score
 * written for a newer engine), the engine substitutes the closest available
 * form instead of failing, and reports the substitution.
 */
import { GEOMETRY_FORMS, type GeometryForm } from "./schema";

export interface RendererCapabilities {
  name: "webgl" | "canvas2d";
  forms: readonly GeometryForm[];
}

export const WEBGL_CAPABILITIES: RendererCapabilities = { name: "webgl", forms: GEOMETRY_FORMS };
/** The 2D fallback draws a flat projection and has no lattice (cross-braced 3D) form. */
export const CANVAS2D_CAPABILITIES: RendererCapabilities = { name: "canvas2d", forms: ["grid", "shards", "ring", "dust", "void", "monolith"] };

const FALLBACK_CHAIN: Record<string, GeometryForm[]> = {
  grid: ["lattice", "monolith"],
  lattice: ["grid", "monolith"],
  shards: ["dust", "grid"],
  ring: ["grid", "monolith"],
  dust: ["shards", "grid"],
  void: ["monolith"],
  monolith: ["grid"]
};

export interface ResolvedForm {
  form: GeometryForm;
  substituted: boolean;
  requested: string;
}

export function resolveForm(requested: string, caps: RendererCapabilities): ResolvedForm {
  if ((caps.forms as readonly string[]).includes(requested)) return { form: requested as GeometryForm, substituted: false, requested };
  for (const alt of FALLBACK_CHAIN[requested] ?? []) {
    if (caps.forms.includes(alt)) return { form: alt, substituted: true, requested };
  }
  return { form: caps.forms[0] ?? "monolith", substituted: true, requested };
}

/** Choose a renderer given what the browser offers. */
export function chooseRenderer(env: { webgl: boolean; forceCanvas?: boolean }): RendererCapabilities {
  return env.webgl && !env.forceCanvas ? WEBGL_CAPABILITIES : CANVAS2D_CAPABILITIES;
}
