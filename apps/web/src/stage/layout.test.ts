import { compile, demoInterpret, EXAMPLE_INTENTS, sample } from "@unperformed/performance-core";
import { describe, expect, it } from "vitest";
import { computeLayout, createLayout, ELEMENT_COUNT } from "./layout";
import type { Words, WordTargets } from "./words";

const { score } = compile(demoInterpret({ intent: EXAMPLE_INTENTS.en[0]!, locale: "en" }), { durationSec: 75, seed: 3 });
const order = score.sections.findIndex((s) => s.archetype === "order");
const silence = score.sections.findIndex((s) => s.archetype === "silence");

/** A fake word: every element aimed at a distinct point on a flat row. */
function row(y: number): WordTargets {
  const xy = new Float32Array(ELEMENT_COUNT * 2);
  for (let i = 0; i < ELEMENT_COUNT; i++) {
    xy[i * 2] = (i / ELEMENT_COUNT - 0.5) * 4;
    xy[i * 2 + 1] = y;
  }
  return { xy, dot: 0.012 };
}

function frameIn(index: number, at = 0.6) {
  const s = score.sections[index]!;
  return sample(score, s.startBeat + s.lengthBeats * at);
}

describe("stage layout with spelled words", () => {
  it("places an ordered section's elements on its word", () => {
    const words: Words = score.sections.map(() => row(1.5));
    const out = computeLayout(frameIn(order), score.seed, createLayout(), false, undefined, words);
    for (let i = 0; i < ELEMENT_COUNT; i++) {
      expect(Math.abs(out.position[i * 3]! - (i / ELEMENT_COUNT - 0.5) * 4)).toBeLessThan(0.35);
      expect(Math.abs(out.position[i * 3 + 1]! - 1.5)).toBeLessThan(0.35);
      expect(out.scale[i * 3 + 1]!).toBeCloseTo(0.012, 3);
    }
  });

  it("leaves the geometric form alone where a name could not be spelled", () => {
    const f = frameIn(order);
    const plain = computeLayout(f, score.seed, createLayout());
    const unspelled = computeLayout(f, score.seed, createLayout(), false, undefined, score.sections.map(() => null));
    expect(unspelled.position).toEqual(plain.position);
    expect(unspelled.scale).toEqual(plain.scale);
  });

  it("does not spell in silence", () => {
    if (silence < 0) return;
    const f = frameIn(silence, 0.9);
    const words: Words = score.sections.map(() => row(1.5));
    expect(computeLayout(f, score.seed, createLayout(), false, undefined, words).position).toEqual(computeLayout(f, score.seed, createLayout()).position);
  });

  it("is deterministic for the same frame, seed and words", () => {
    const words: Words = score.sections.map((_, i) => row(1 + i * 0.1));
    for (const at of [0.05, 0.5, 0.95]) {
      for (let s = 0; s < score.sections.length; s++) {
        const f = frameIn(s, at);
        expect(computeLayout(f, 9, createLayout(), false, undefined, words)).toEqual(computeLayout(f, 9, createLayout(), false, undefined, words));
      }
    }
  });
});
