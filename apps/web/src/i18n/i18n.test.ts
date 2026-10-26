import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { en } from "./en";
import { zhTW } from "./zh-TW";
import { format } from "./index";

describe("localization", () => {
  it("has the same keys in English and Traditional Chinese", () => {
    expect(Object.keys(zhTW).sort()).toEqual(Object.keys(en).sort());
  });

  it("has no empty strings", () => {
    for (const [k, v] of Object.entries(zhTW)) expect(v.trim(), k).not.toBe("");
  });

  it("keeps the same placeholders in both languages", () => {
    for (const k of Object.keys(en) as (keyof typeof en)[]) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
      expect(ph(zhTW[k]), k).toEqual(ph(en[k]));
    }
  });

  it("translates enum params", () => {
    expect(format("zh-TW", "decision.camera.variety", { move: "orbit" })).toContain("環繞");
    expect(format("en", "event.decision", { option: "ai" })).toBe("Chose: the director's proposal");
  });

  it("covers every message key the core engine emits", () => {
    const coreDir = join(__dirname, "..", "..", "..", "..", "packages", "performance-core", "src");
    const keys = new Set<string>();
    for (const f of readdirSync(coreDir)) {
      const src = readFileSync(join(coreDir, f), "utf8");
      for (const m of src.matchAll(/\bt\(\s*"([a-z][\w.-]+)"/g)) keys.add(m[1]!);
      for (const m of src.matchAll(/reasonKey = "([\w.-]+)"/g)) keys.add(m[1]!);
    }
    expect(keys.size).toBeGreaterThan(30);
    for (const k of keys) expect(Object.keys(en), k).toContain(k);
  });
});
