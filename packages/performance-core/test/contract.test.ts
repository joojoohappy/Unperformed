/**
 * Cross-language contract: the same JSON fixtures are validated here (zod)
 * and in services/ai/tests/test_contract.py (Pydantic). Regenerate with
 * UPDATE_FIXTURES=1 pnpm --filter @unperformed/performance-core test
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { zodToJsonSchema } from "zod-to-json-schema";
import { demoInterpret, EXAMPLE_INTENTS, Interpretation, PerformanceScore, validateWith } from "../src";

const here = dirname(fileURLToPath(import.meta.url));
const FIX = join(here, "..", "fixtures");
const SCHEMA_OUT = join(here, "..", "..", "..", "docs", "schema");
const update = process.env["UPDATE_FIXTURES"] === "1";

function fixture(name: string, value: unknown): unknown {
  const path = join(FIX, name);
  const text = JSON.stringify(value, null, 2) + "\n";
  if (update || !existsSync(path)) writeFileSync(path, text);
  return JSON.parse(readFileSync(path, "utf8"));
}

const valid = {
  "interpretation.valid.en.json": demoInterpret({ intent: EXAMPLE_INTENTS.en[0]!, locale: "en" }),
  "interpretation.valid.zh-TW.json": demoInterpret({ intent: EXAMPLE_INTENTS["zh-TW"][0]!, locale: "zh-TW" })
};

const base = valid["interpretation.valid.en.json"];
const invalid = {
  "interpretation.invalid.climax-index.json": { ...base, climax: { phaseIndex: 0, release: "held", holdBeats: 4 } },
  "interpretation.invalid.enum.json": { ...base, mood: "happy" },
  "interpretation.invalid.extra-field.json": { ...base, javascript: "alert(1)" },
  "interpretation.invalid.too-few-phases.json": { ...base, phases: base.phases.slice(0, 2), climax: null }
};

describe("shared fixtures", () => {
  it.each(Object.entries(valid))("%s is valid", (name, value) => {
    const r = validateWith(Interpretation, fixture(name, value));
    expect(r.ok).toBe(true);
  });

  it.each(Object.entries(invalid))("%s is rejected", (name, value) => {
    expect(validateWith(Interpretation, fixture(name, value)).ok).toBe(false);
  });

  it("published JSON Schema for the Performance Score is up to date", () => {
    const path = join(SCHEMA_OUT, "performance-score.schema.json");
    const schema = JSON.stringify(zodToJsonSchema(PerformanceScore, { name: "PerformanceScore", $refStrategy: "none" }), null, 2) + "\n";
    if (update || !existsSync(path)) writeFileSync(path, schema);
    expect(readFileSync(path, "utf8")).toBe(schema);
  });
});
