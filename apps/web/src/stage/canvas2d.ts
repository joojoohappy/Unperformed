/**
 * 2D fallback stage, used when WebGL is unavailable. It projects the same
 * layout with a simple pinhole camera. Less atmosphere, same choreography.
 */
import { resolveForm, CANVAS2D_CAPABILITIES, type StageFrame } from "@unperformed/performance-core";
import { computeLayout, createLayout, ELEMENT_COUNT } from "./layout";
import type { StageRenderer } from "./types";

export class Canvas2DStage implements StageRenderer {
  readonly name = "canvas2d" as const;
  private ctx: CanvasRenderingContext2D;
  private layout = createLayout();
  private w = 1;
  private h = 1;
  private dpr = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("2D canvas unavailable");
    this.ctx = ctx;
  }

  resize(width: number, height: number, dpr: number): void {
    this.w = width;
    this.h = height;
    this.dpr = Math.min(dpr, 2);
    this.canvas.width = Math.round(width * this.dpr);
    this.canvas.height = Math.round(height * this.dpr);
  }

  render(frame: StageFrame, seed: number, reducedMotion: boolean): void {
    // Substitute forms this renderer cannot draw.
    const f: StageFrame = {
      ...frame,
      geometry: {
        ...frame.geometry,
        from: resolveForm(frame.geometry.from, CANVAS2D_CAPABILITIES).form,
        to: resolveForm(frame.geometry.to, CANVAS2D_CAPABILITIES).form
      }
    };
    const { ctx } = this;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#050505";
    ctx.fillRect(0, 0, this.w, this.h);
    const vis = 1 - f.blackout;
    const [kr, kg, kb] = f.keyColor.map((x) => Math.round(x * 255)) as [number, number, number];
    const pool = ctx.createRadialGradient(this.w / 2, this.h * 0.72, 0, this.w / 2, this.h * 0.72, this.w * 0.45);
    pool.addColorStop(0, `rgba(${kr},${kg},${kb},${0.35 * f.intensity * vis})`);
    pool.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, this.w, this.h);

    computeLayout(f, seed, this.layout, reducedMotion);
    const [cx, cy, cz] = f.camera.position;
    const [tx, ty, tz] = f.camera.target;
    // Camera basis
    let fx = tx - cx, fy = ty - cy, fz = tz - cz;
    const fl = Math.hypot(fx, fy, fz) || 1;
    fx /= fl; fy /= fl; fz /= fl;
    let rx = -fz, rz = fx;
    const rl = Math.hypot(rx, rz) || 1;
    rx /= rl; rz /= rl;
    const ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;
    const focal = (this.h / 2) / Math.tan((f.camera.fov * Math.PI) / 360);
    const { position: p, scale: s } = this.layout;
    const brightness = (0.25 + 0.75 * f.intensity) * vis;
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      const k = i * 3;
      if (s[k + 1]! <= 0.001) continue;
      const dx = p[k]! - cx, dy = p[k + 1]! - cy, dz = p[k + 2]! - cz;
      const depth = dx * fx + dy * fy + dz * fz;
      if (depth < 0.2) continue;
      const sx = this.w / 2 + ((dx * rx + dz * rz) * focal) / depth;
      const sy = this.h / 2 - ((dx * ux + dy * uy + dz * uz) * focal) / depth;
      const w = Math.max(1, (s[k]! * focal) / depth);
      const h = Math.max(1, (s[k + 1]! * focal) / depth);
      const fog = Math.exp(-depth * 0.06);
      ctx.fillStyle = `rgba(${kr},${kg},${kb},${Math.min(1, brightness * fog)})`;
      ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
    }
  }

  dispose(): void {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }
}
