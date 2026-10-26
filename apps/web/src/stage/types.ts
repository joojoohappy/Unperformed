import type { StageFrame } from "@unperformed/performance-core";
import type { QualitySettings } from "./quality";

export interface StageRenderer {
  readonly name: "webgl" | "canvas2d";
  resize(width: number, height: number, dpr: number): void;
  render(frame: StageFrame, seed: number, reducedMotion: boolean): void;
  /** Takes effect on the next render; call resize() after it so the pixel ratio applies. */
  setQuality(q: QualitySettings): void;
  dispose(): void;
}
