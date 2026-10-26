import type { StageFrame, StageSet } from "@unperformed/performance-core";
import type { QualitySettings } from "./quality";
import type { Words } from "./words";

export interface StageRenderer {
  readonly name: "webgl" | "canvas2d";
  resize(width: number, height: number, dpr: number): void;
  render(frame: StageFrame, seed: number, reducedMotion: boolean): void;
  /** Takes effect on the next render; call resize() after it so the pixel ratio applies. */
  setQuality(q: QualitySettings): void;
  /** Section names as dot targets, by section index (see words.ts). */
  setWords(words: Words): void;
  /** The set pieces for this idea (score.set); stages that draw no set ignore it. */
  setStageSet?(set: StageSet): void;
  dispose(): void;
}
