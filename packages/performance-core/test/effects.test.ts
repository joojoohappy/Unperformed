import { describe, expect, it } from "vitest";
import { CANVAS2D_CAPABILITIES, chooseRenderer, resolveForm, WEBGL_CAPABILITIES } from "../src";

describe("rendering fallbacks", () => {
  it("uses the 2D canvas renderer when WebGL is unavailable", () => {
    expect(chooseRenderer({ webgl: false }).name).toBe("canvas2d");
    expect(chooseRenderer({ webgl: true }).name).toBe("webgl");
    expect(chooseRenderer({ webgl: true, forceCanvas: true }).name).toBe("canvas2d");
  });

  it("substitutes forms the renderer cannot draw and reports it", () => {
    expect(resolveForm("lattice", CANVAS2D_CAPABILITIES)).toEqual({ form: "grid", substituted: true, requested: "lattice" });
    expect(resolveForm("lattice", WEBGL_CAPABILITIES).substituted).toBe(false);
  });

  it("survives forms from a future schema", () => {
    const r = resolveForm("hologram", WEBGL_CAPABILITIES);
    expect(r.substituted).toBe(true);
    expect(WEBGL_CAPABILITIES.forms).toContain(r.form);
  });
});
