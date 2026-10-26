#!/usr/bin/env node
// Measures the deterministic core on this machine. Every number it prints is a
// real measurement from this run; nothing is estimated or copied from elsewhere.
//
//   pnpm bench            -> prints a table and writes docs/evaluation/bench-core.json
import { writeFileSync, mkdirSync } from "node:fs";
import { cpus, platform, release } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { loadCore, root } from "./lib/bundle-core.mjs";

const core = await loadCore();
const { EXAMPLE_INTENTS, demoInterpret, compile, validateScore, sampleRange, flashReport, applyPatch, openRound, resolveRound, parseRequestRules, timelineFingerprint } = core;

function measure(name, iterations, fn) {
  for (let i = 0; i < Math.min(20, iterations); i++) fn(); // warm-up
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const q = (p) => times[Math.min(times.length - 1, Math.floor(p * times.length))];
  return { name, iterations, medianMs: +q(0.5).toFixed(4), p95Ms: +q(0.95).toFixed(4), maxMs: +times[times.length - 1].toFixed(4) };
}

const intent = EXAMPLE_INTENTS.en[0];
const interp = demoInterpret({ intent, locale: "en" });
const { score: base } = compile(interp, { durationSec: 75, seed: 1234 });
const approve = { ops: base.constraints.map((c) => ({ op: "setConstraintStatus", constraintId: c.id, status: "approved" })) };
const approved = applyPatch(base, approve, { actor: "human", humanApproved: true }).score;
const request = { id: "r1", text: "I want everything to explode at the climax.", kind: parseRequestRules("I want everything to explode at the climax."), source: { kind: "rules" } };

const rows = [
  measure("demoInterpret (rules planner)", 2000, () => demoInterpret({ intent, locale: "en" })),
  measure("compile (interpretation → validated score)", 2000, () => compile(interp, { durationSec: 75, seed: 1234 })),
  measure("validateScore (zod)", 2000, () => validateScore(base)),
  measure("applyPatch (approve constraints)", 2000, () => applyPatch(base, approve, { actor: "human", humanApproved: true })),
  measure("openRound (climax negotiation)", 2000, () => openRound({ id: "n1", score: approved, request, memory: { entries: [] } })),
  measure("open + resolve round", 1000, () => {
    const round = openRound({ id: "n1", score: approved, request, memory: { entries: [] } });
    resolveRound(round, "ai", approved, { entries: [] });
  }),
  measure("sampleRange 75 s @ 60 fps (4,500 frames)", 50, () => sampleRange(approved, 60)),
  measure("flashReport 75 s @ 60 fps", 50, () => flashReport(approved, {}, 60))
];

// Determinism check: the same input must give the same timeline.
const fpA = timelineFingerprint(compile(interp, { durationSec: 75, seed: 1234 }).score);
const fpB = timelineFingerprint(compile(interp, { durationSec: 75, seed: 1234 }).score);
const flash = flashReport(approved, {}, 60);
// Worst case the schema allows: maximum flicker in every section.
const maxFlicker = applyPatch(base, { ops: base.sections.map((x) => ({ op: "setLighting", sectionId: x.id, flicker: 1 })) }, { actor: "human", humanApproved: true });
const worst = maxFlicker.ok ? flashReport(maxFlicker.score, {}, 60) : null;

const env = { node: process.version, platform: `${platform()} ${release()}`, cpu: cpus()[0]?.model ?? "unknown", cores: cpus().length, date: new Date().toISOString() };
console.log(`UNPERFORMED core benchmark — ${env.node}, ${env.cpu} × ${env.cores}`);
console.table(rows.map((r) => ({ step: r.name, n: r.iterations, "median ms": r.medianMs, "p95 ms": r.p95Ms, "max ms": r.maxMs })));
console.log(`Deterministic timeline: ${fpA === fpB ? "yes" : "NO"}; demo score max flashes/s: ${flash.maxFlashesPerSecond} (limit 3, ${flash.safe ? "safe" : "UNSAFE"})`);
console.log(`Max flicker in every section: ${worst ? `${worst.maxFlashesPerSecond} flashes/s (${worst.safe ? "safe" : "UNSAFE"})` : "patch rejected"}`);

const out = join(root, "docs", "evaluation");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "bench-core.json"), JSON.stringify({ env, rows, deterministic: fpA === fpB, flash, worstCaseFlash: worst }, null, 2) + "\n");
