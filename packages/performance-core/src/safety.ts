/**
 * Photosensitivity checks.
 *
 * Approximates the WCAG 2.3.1 "general flash" rule on the sampled timeline:
 * a flash is a pair of opposing changes in relative luminance of at least 0.1
 * (10% of the maximum), where the darker state is below 0.8. Luminance per frame
 * is approximated from the key light colour, intensity and blackout. No one-second
 * window may contain more than three flashes.
 */
import type { PerformanceScore } from "./schema";
import { sampleRange, type SampleOptions, type StageFrame } from "./timeline";
import { relativeLuminance } from "./util";

export function frameLuminance(f: StageFrame): number {
  return relativeLuminance(f.keyColor) * f.intensity * (1 - f.blackout);
}

export function maxFlashesPerSecond(lum: number[], fps: number): number {
  // Track the running extreme; a "change" is a reversal of at least 0.1 in
  // relative luminance (10% of the maximum, 1.0) with the darker state below 0.8.
  const changes: number[] = [];
  let extreme = lum[0] ?? 0;
  let trend: 0 | 1 | -1 = 0;
  for (let i = 1; i < lum.length; i++) {
    const v = lum[i]!;
    const big = Math.abs(v - extreme) >= 0.1 && Math.min(v, extreme) < 0.8;
    if (trend === 0) {
      if (big) {
        trend = v > extreme ? 1 : -1;
        changes.push(i);
        extreme = v;
      }
    } else if (trend === 1) {
      if (v > extreme) extreme = v;
      else if (big) {
        trend = -1;
        changes.push(i);
        extreme = v;
      }
    } else if (v < extreme) extreme = v;
    else if (big) {
      trend = 1;
      changes.push(i);
      extreme = v;
    }
  }
  let worst = 0;
  for (let i = 0; i < changes.length; i++) {
    let count = 0;
    for (let j = i; j < changes.length && changes[j]! - changes[i]! < fps; j++) count++;
    worst = Math.max(worst, Math.floor(count / 2));
  }
  return worst;
}

export function flashReport(score: PerformanceScore, opts: SampleOptions = {}, fps = 60): { maxFlashesPerSecond: number; safe: boolean } {
  const lum = sampleRange(score, fps, opts).map(frameLuminance);
  const m = maxFlashesPerSecond(lum, fps);
  return { maxFlashesPerSecond: m, safe: m <= 3 };
}
