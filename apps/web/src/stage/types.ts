import type { StageFrame } from "@unperformed/performance-core";

export interface StageRenderer {
  readonly name: "webgl" | "canvas2d";
  resize(width: number, height: number, dpr: number): void;
  render(frame: StageFrame, seed: number, reducedMotion: boolean): void;
  dispose(): void;
}
