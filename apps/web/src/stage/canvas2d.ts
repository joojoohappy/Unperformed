/**
 * 2D fallback stage, used when WebGL is unavailable. It projects the same
 * layout with a simple pinhole camera. Less atmosphere, same choreography.
 */
import { resolveForm, CANVAS2D_CAPABILITIES, type StageFrame } from "@unperformed/performance-core";
import { computeLayout, createLayout, ELEMENT_COUNT } from "./layout";
import { LOOKS, lookFor } from "./look";
import { pixelRatio, QUALITY, type QualitySettings } from "./quality";
import type { StageRenderer } from "./types";

export class Canvas2DStage implements StageRenderer {
  readonly name = "canvas2d" as const;
  private ctx: CanvasRenderingContext2D;
  private layout = createLayout();
  private look = { ...LOOKS.order };
  private w = 1;
  private h = 1;
  private dpr = 1;
  private quality: QualitySettings = QUALITY.full;

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
    const L = lookFor(f, this.look);
    const vis = 1 - f.blackout;
    const [kr, kg, kb] = f.keyColor.map((x) => Math.round(x * 255)) as [number, number, number];
    const [ar, ag, ab] = f.accentColor.map((x) => Math.round(x * 255)) as [number, number, number];
    const pool = ctx.createRadialGradient(this.w / 2, this.h * 0.72, 0, this.w / 2, this.h * 0.72, this.w * 0.45);
    pool.addColorStop(0, `rgba(${kr},${kg},${kb},${0.35 * f.intensity * vis * (0.6 + 0.4 * L.gloss)})`);
    pool.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = pool;
    ctx.fillRect(0, 0, this.w, this.h);

    // The key light as a soft shaft from above, wide or narrow by section type.
    const beamA = L.beam * 0.35 * (0.5 + 0.5 * f.intensity) * vis;
    if (beamA > 0.003) {
      const top = this.w / 2 + L.keyX * this.w * 0.04;
      const half = this.w * 0.035 * L.beamWidth;
      const g = ctx.createLinearGradient(0, 0, 0, this.h * 0.8);
      g.addColorStop(0, `rgba(${kr},${kg},${kb},${beamA * 1.4})`);
      g.addColorStop(1, `rgba(${kr},${kg},${kb},${beamA * 0.4})`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(top - 2, 0);
      ctx.lineTo(top + 2, 0);
      ctx.lineTo(this.w / 2 + half, this.h * 0.8);
      ctx.lineTo(this.w / 2 - half, this.h * 0.8);
      ctx.closePath();
      ctx.fill();
    }

    computeLayout(f, seed, this.layout, reducedMotion, L);
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
    const brightness = (0.25 + 0.75 * f.intensity) * vis * Math.min(1.3, 0.6 + 0.4 * L.glow);
    const mixC = (k: number, a: number) => Math.round(k + (a - k) * L.accent);
    const er = mixC(kr, ar), eg = mixC(kg, ag), eb = mixC(kb, ab);
    const fogK = L.fog * 1.1;

    // Ruled floor lines for ordered sections, projected with the same camera.
    if (L.floorGrid > 0.01) {
      ctx.strokeStyle = `rgba(${kr},${kg},${kb},${L.floorGrid * (0.4 + 0.6 * f.intensity) * vis})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      const project = (x: number, z: number): [number, number] | null => {
        const dx = x - cx, dy = -cy, dz = z - cz;
        const depth = dx * fx + dy * fy + dz * fz;
        if (depth < 0.3) return null;
        return [this.w / 2 + ((dx * rx + dz * rz) * focal) / depth, this.h / 2 - ((dx * ux + dy * uy + dz * uz) * focal) / depth];
      };
      for (let g = -12; g <= 12; g += 1.2) {
        for (const [a, b] of [[project(g, -12), project(g, 12)], [project(-12, g), project(12, g)]] as const) {
          if (!a || !b) continue;
          ctx.moveTo(a[0], a[1]);
          ctx.lineTo(b[0], b[1]);
        }
      }
      ctx.stroke();
    }

    for (let i = 0; i < ELEMENT_COUNT; i += this.quality.elementStride) {
      const k = i * 3;
      if (s[k + 1]! <= 0.001) continue;
      const dx = p[k]! - cx, dy = p[k + 1]! - cy, dz = p[k + 2]! - cz;
      const depth = dx * fx + dy * fy + dz * fz;
      if (depth < 0.2) continue;
      const sx = this.w / 2 + ((dx * rx + dz * rz) * focal) / depth;
      const sy = this.h / 2 - ((dx * ux + dy * uy + dz * uz) * focal) / depth;
      const w = Math.max(1, (s[k]! * focal) / depth);
      const h = Math.max(1, (s[k + 1]! * focal) / depth);
      const fog = Math.exp(-depth * fogK);
      ctx.fillStyle = `rgba(${er},${eg},${eb},${Math.min(1, brightness * fog)})`;
      ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
    }
  }

  setQuality(q: QualitySettings): void {
    this.quality = q;
  }

  dispose(): void {
    this.ctx.clearRect(0, 0, this.w, this.h);
  }
}
