import { describe, expect, it } from "vitest";
import { AdaptiveQuality, FRAME_BUDGET_MS, p95, pixelRatio, QUALITY, qualityModeFromSearch, STRIKES, WARMUP_FRAMES, WINDOW_MS } from "./quality";

function feed(q: AdaptiveQuality, ms: number | ((i: number) => number), n: number): number | null {
  for (let i = 0; i < n; i++) if (q.push(typeof ms === "number" ? ms : ms(i))) return i;
  return null;
}

describe("adaptive quality", () => {
  it("stays at full quality when frames are within budget", () => {
    const q = new AdaptiveQuality();
    expect(feed(q, 16.7, 2000)).toBeNull();
    expect(q.level).toBe("full");
  });

  it("drops to reduced once the p95 frame time exceeds the budget", () => {
    const q = new AdaptiveQuality();
    const changedAt = feed(q, 33, 2000);
    expect(changedAt).not.toBeNull();
    // After warm-up and three consecutive slow one-second windows.
    expect(changedAt).toBe(WARMUP_FRAMES + STRIKES * Math.ceil(WINDOW_MS / 33) - 1);
    expect(q.level).toBe("reduced");
  });

  it("reacts within a few seconds on a very slow device", () => {
    const q = new AdaptiveQuality();
    const changedAt = feed(q, 100, 1000)!;
    expect(changedAt * 100).toBeLessThanOrEqual(5000);
    expect(q.level).toBe("reduced");
  });

  it("ignores slow warm-up frames", () => {
    const q = new AdaptiveQuality();
    expect(feed(q, (i) => (i < WARMUP_FRAMES ? 200 : 16.7), 1000)).toBeNull();
    expect(q.level).toBe("full");
  });

  it("tolerates occasional slow frames (below 5%)", () => {
    const q = new AdaptiveQuality();
    expect(feed(q, (i) => (i % 25 === 0 ? 40 : 16.7), 3000)).toBeNull();
    expect(q.level).toBe("full");
  });

  it("ignores a hitch shorter than a second, wherever it falls", () => {
    for (let start = 100; start < 160; start += 7) {
      const q = new AdaptiveQuality();
      expect(feed(q, (i) => (i >= start && i < start + 28 ? 33 : 16.7), 3000)).toBeNull();
    }
  });

  it("reduces on sustained jank at a 60 Hz cap (every fourth frame missed)", () => {
    const q = new AdaptiveQuality();
    expect(feed(q, (i) => (i % 4 === 0 ? 33.3 : 16.7), 3000)).not.toBeNull();
  });

  it("treats long pauses (hidden tab) as gaps, not slow frames", () => {
    const q = new AdaptiveQuality();
    expect(feed(q, (i) => (i % 3 === 0 ? 1500 : 16.7), 3000)).toBeNull();
    expect(q.level).toBe("full");
  });

  it("does not go back up after reducing", () => {
    const q = new AdaptiveQuality();
    feed(q, 33, 500);
    expect(q.level).toBe("reduced");
    expect(feed(q, 8, 2000)).toBeNull();
    expect(q.level).toBe("reduced");
  });

  it("fixed modes never adapt", () => {
    const full = new AdaptiveQuality("full");
    expect(feed(full, 100, 1000)).toBeNull();
    expect(full.level).toBe("full");
    expect(new AdaptiveQuality("reduced").level).toBe("reduced");
  });

  it("reads the mode from the URL", () => {
    expect(qualityModeFromSearch("?quality=reduced")).toBe("reduced");
    expect(qualityModeFromSearch("?renderer=canvas&quality=full")).toBe("full");
    expect(qualityModeFromSearch("?quality=ultra")).toBe("auto");
    expect(qualityModeFromSearch("")).toBe("auto");
  });

  it("reduced quality renders about half the pixels or fewer", () => {
    expect(pixelRatio(1, QUALITY.full)).toBe(1);
    expect(pixelRatio(3, QUALITY.full)).toBe(2);
    for (const dpr of [1, 2, 3]) expect((pixelRatio(dpr, QUALITY.reduced) / pixelRatio(dpr, QUALITY.full)) ** 2).toBeLessThanOrEqual(0.5);
  });

  it("p95 picks the 95th percentile", () => {
    expect(p95(Array.from({ length: 100 }, (_, i) => i + 1))).toBe(96);
    expect(p95([])).toBe(0);
    expect(FRAME_BUDGET_MS).toBe(20);
  });
});
