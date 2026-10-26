/**
 * 2D fallback for the stage set, used when WebGL is unavailable. It projects
 * the same set layout with a simple pinhole camera: flat shapes, additive
 * light, a faint reflection. Less atmosphere, same set and choreography.
 */
import { DEFAULT_SET, type StageFrame, type StageSet } from "@unperformed/performance-core";
import { LOOKS, lookFor } from "./look";
import { pixelRatio, QUALITY, type QualitySettings } from "./quality";
import { computeSet, createSetScene, framing, SCREEN_COLS, SCREEN_ROWS, STRING_SEGMENTS, type Pieces } from "./setLayout";
import type { StageRenderer } from "./types";
import type { Words } from "./words";

type V3 = [number, number, number];

export class SetCanvas2DStage implements StageRenderer {
  readonly name = "canvas2d" as const;
  private ctx: CanvasRenderingContext2D;
  private layout = createSetScene();
  private look = { ...LOOKS.order };
  private words: Words = [];
  private set: StageSet = DEFAULT_SET;
  private w = 1;
  private h = 1;
  private dpr = 1;
  private quality: QualitySettings = QUALITY.full;
  // Camera basis for this frame.
  private cam: V3 = [0, 0, 0];
  private f: V3 = [0, 0, 1];
  private r: V3 = [1, 0, 0];
  private u: V3 = [0, 1, 0];
  private focal = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number): void {
    this.w = width;
    this.h = height;
    this.dpr = pixelRatio(dpr, this.quality);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
  }

  /** Screen x, y and depth, or null behind the camera. */
  private project(x: number, y: number, z: number): V3 | null {
    const [cx, cy, cz] = this.cam;
    const dx = x - cx, dy = y - cy, dz = z - cz;
    const depth = dx * this.f[0] + dy * this.f[1] + dz * this.f[2];
    if (depth < 0.2) return null;
    return [
      this.w / 2 + ((dx * this.r[0] + dy * this.r[1] + dz * this.r[2]) * this.focal) / depth,
      this.h / 2 - ((dx * this.u[0] + dy * this.u[1] + dz * this.u[2]) * this.focal) / depth,
      depth
    ];
  }

  render(frame: StageFrame, seed: number, reducedMotion: boolean): void {
    const L = lookFor(frame, this.look);
    const S = computeSet(frame, seed, this.set, this.layout, reducedMotion, L, this.words);
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalCompositeOperation = "source-over";
    ctx.fillStyle = "#040405";
    ctx.fillRect(0, 0, this.w, this.h);

    const c = frame.camera;
    const view = framing(this.w / Math.max(1, this.h), c.fov);
    this.cam = c.position;
    let f: V3 = [c.target[0] - c.position[0], c.target[1] + view.lift - c.position[1], c.target[2] - c.position[2]];
    const fl = Math.hypot(...f) || 1;
    f = [f[0] / fl, f[1] / fl, f[2] / fl];
    let r: V3 = [-f[2], 0, f[0]];
    const rl = Math.hypot(...r) || 1;
    r = [r[0] / rl, 0, r[2] / rl];
    this.f = f;
    this.r = r;
    this.u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
    this.focal = this.h / 2 / Math.tan((view.fov * Math.PI) / 360);

    const light = S.light;
    const rgb = (k: readonly number[], a: number) => `rgba(${Math.round(k[0]! * 255)},${Math.round(k[1]! * 255)},${Math.round(k[2]! * 255)},${Math.min(1, Math.max(0, a))})`;
    const mix = (t: number) => frame.keyColor.map((k, i) => k + (S.energyColor[i]! - k) * t);
    const key = frame.keyColor;
    const energy = S.energyColor;

    // Horizon and floor.
    const horizon = this.project(0, 0, -40);
    const hy = horizon ? horizon[1] : this.h * 0.6;
    const floorG = ctx.createLinearGradient(0, hy, 0, this.h);
    floorG.addColorStop(0, S.floor === "water" ? "#05101a" : S.floor === "matte" ? "#100f0d" : "#0a0a0c");
    floorG.addColorStop(1, "#020203");
    ctx.fillStyle = floorG;
    ctx.fillRect(0, hy, this.w, this.h - hy);

    ctx.globalCompositeOperation = "lighter";
    // Glow behind the set.
    const g0 = this.project(0, 4, -11);
    if (g0 && S.backGlow > 0.01) {
      const rad = (14 * this.focal) / g0[2];
      const g = ctx.createRadialGradient(g0[0], g0[1], 0, g0[0], g0[1], rad);
      g.addColorStop(0, rgb(energy, 0.5 * S.backGlow * light));
      g.addColorStop(1, rgb(energy, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // Beams. They hold up in quiet sections: in silence a beam is all that is left.
    const beamLight = (1 - frame.blackout) * (0.55 + 0.45 * frame.intensity);
    for (let b = 0; b < S.beamCount; b++) {
      const [top, foot, level] = [S.beams[b * 3]!, S.beams[b * 3 + 1]!, S.beams[b * 3 + 2]!];
      const p0 = this.project(top, 11, -2.5);
      const p1 = this.project(foot, 0, -1);
      if (!p0 || !p1) continue;
      const half = ((b === 0 ? 0.35 + 0.35 * L.beamWidth : 0.5) * this.focal) / p1[2];
      const g = ctx.createLinearGradient(0, p0[1], 0, p1[1]);
      g.addColorStop(0, rgb(key, 0.35 * level * beamLight));
      g.addColorStop(1, rgb(key, 0.08 * level * beamLight));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(p0[0] - 2, p0[1]);
      ctx.lineTo(p0[0] + 2, p0[1]);
      ctx.lineTo(p1[0] + half, p1[1]);
      ctx.lineTo(p1[0] - half, p1[1]);
      ctx.closePath();
      ctx.fill();
    }

    // Strings.
    ctx.lineWidth = 1;
    const sc = mix(S.energy);
    for (let i = 0; i < S.strings.count; i += STRING_SEGMENTS * (this.quality.elementStride > 1 ? 2 : 1)) {
      const b = S.strings.light[i]! * light;
      if (b < 0.02) continue;
      ctx.strokeStyle = rgb(sc, 0.7 * b);
      ctx.beginPath();
      for (let j = 0; j < STRING_SEGMENTS; j++) {
        const o = (i + j) * 6;
        const a = this.project(S.strings.vertices[o]!, S.strings.vertices[o + 1]!, S.strings.vertices[o + 2]!);
        const z = this.project(S.strings.vertices[o + 3]!, S.strings.vertices[o + 4]!, S.strings.vertices[o + 5]!);
        if (!a || !z) continue;
        ctx.moveTo(a[0], a[1]);
        ctx.lineTo(z[0], z[1]);
      }
      ctx.stroke();
    }

    // LED panels.
    for (let p = 0; p < S.panelCount; p++) {
      const [px, py, pz, pw, ph] = [S.panels[p * 5]!, S.panels[p * 5 + 1]!, S.panels[p * 5 + 2]!, S.panels[p * 5 + 3]!, S.panels[p * 5 + 4]!];
      const a = this.project(px - pw / 2, py + ph / 2, pz);
      const z = this.project(px + pw / 2, py - ph / 2, pz);
      if (!a || !z) continue;
      const cw = (z[0] - a[0]) / SCREEN_COLS, ch = (z[1] - a[1]) / SCREEN_ROWS;
      const cc = mix(0.3 + 0.7 * S.energy);
      for (let row = 0; row < SCREEN_ROWS; row++) {
        for (let col = 0; col < SCREEN_COLS; col++) {
          const v = S.cells[(p * SCREEN_ROWS + row) * SCREEN_COLS + col]! * light;
          if (v < 0.03) continue;
          ctx.fillStyle = rgb(cc, v);
          ctx.fillRect(a[0] + col * cw + cw * 0.1, z[1] - (row + 1) * ch + ch * 0.1, cw * 0.8, ch * 0.8);
        }
      }
    }

    // Lasers.
    ctx.lineWidth = 1.5;
    for (let i = 0; i < S.lasers.count; i++) {
      const o = i * 6;
      const a = this.project(S.lasers.vertices[o]!, S.lasers.vertices[o + 1]!, S.lasers.vertices[o + 2]!);
      const z = this.clipTo(S.lasers.vertices, o);
      if (!a || !z) continue;
      ctx.strokeStyle = rgb(energy, S.lasers.light[i]! * light);
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(z[0], z[1]);
      ctx.stroke();
    }

    // Solid pieces: faint reflection first, then the pieces.
    ctx.globalCompositeOperation = "source-over";
    const crystal = mix(S.energy);
    const lit = (0.25 + 0.6 * S.energy) * light;
    const ring = mix(S.energy);
    const groups: [Pieces, string, number][] = [
      [S.monolith, "#0b0b0d", 1],
      [S.pillars, rgb(crystal.map((x) => 0.55 * x + 0.45 * lit), 0.95), 1],
      [S.ring, rgb(ring, S.ringLight * light), 1],
      [S.shards, rgb(crystal.map((x) => 0.5 * x + 0.5 * lit), 0.9), this.quality.elementStride],
      [S.words, rgb(mix(0.5 * S.energy), S.wordLight * light), 1]
    ];
    if (S.floor !== "matte") {
      ctx.globalAlpha = S.floor === "water" ? 0.18 : 0.26;
      for (const [p, fill, stride] of groups) this.pieces(p, fill, stride, -1);
      ctx.globalAlpha = 1;
    }
    for (const [p, fill, stride] of groups) this.pieces(p, fill, stride, 1);
  }

  /** The far end of a laser line, pulled in front of the camera if it passes behind it. */
  private clipTo(v: Float32Array, o: number): V3 | null {
    for (let t = 1; t > 0.05; t *= 0.6) {
      const p = this.project(v[o]! + (v[o + 3]! - v[o]!) * t, v[o + 1]! + (v[o + 4]! - v[o + 1]!) * t, v[o + 2]! + (v[o + 5]! - v[o + 2]!) * t);
      if (p) return p;
    }
    return null;
  }

  /** Each box drawn as the parallelogram its rotated x and y axes span on screen. */
  private pieces(p: Pieces, fill: string, stride: number, mirror: 1 | -1): void {
    const { ctx } = this;
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (let i = 0; i < p.count; i += stride) {
      const k = i * 3;
      const sx = p.scale[k]!, sy = p.scale[k + 1]!;
      if (sy <= 1e-4) continue;
      const [ax, ay, az] = [p.rotation[k]!, p.rotation[k + 1]!, p.rotation[k + 2]!];
      // Columns of the XYZ euler rotation matrix (three.js order).
      const ca = Math.cos(ax), sa = Math.sin(ax), cb = Math.cos(ay), sb = Math.sin(ay), cc = Math.cos(az), sc = Math.sin(az);
      const ex: V3 = [cb * cc, ca * sc + sa * sb * cc, sa * sc - ca * sb * cc];
      const ey: V3 = [-cb * sc, ca * cc - sa * sb * sc, sa * cc + ca * sb * sc];
      const x = p.position[k]!, y = p.position[k + 1]! * mirror, z = p.position[k + 2]!;
      const corner = (a: number, b: number) =>
        this.project(x + ex[0] * a * sx + ey[0] * b * sy, y + (ex[1] * a * sx + ey[1] * b * sy) * mirror, z + ex[2] * a * sx + ey[2] * b * sy);
      const c0 = corner(-0.5, -0.5), c1 = corner(0.5, -0.5), c2 = corner(0.5, 0.5), c3 = corner(-0.5, 0.5);
      if (!c0 || !c1 || !c2 || !c3) continue;
      ctx.moveTo(c0[0], c0[1]);
      ctx.lineTo(c1[0], c1[1]);
      ctx.lineTo(c2[0], c2[1]);
      ctx.lineTo(c3[0], c3[1]);
      ctx.closePath();
    }
    ctx.fill();
  }

  setWords(words: Words): void {
    this.words = words;
  }

  setStageSet(set: StageSet): void {
    this.set = set;
  }

  setQuality(q: QualitySettings): void {
    this.quality = q;
  }

  dispose(): void {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }
}
