#!/usr/bin/env node
// Measures the built web studio in headless Chromium: bundle size, first load,
// compile latency and frame rate for both renderers. Every value is measured in
// this run. Headless Chromium here renders WebGL with SwiftShader (a CPU
// rasteriser), so frame rates are a floor, not what a GPU-backed browser shows.
//
//   pnpm bench:browser     -> builds, serves, measures, writes docs/evaluation/bench-browser.json
import { spawn, execSync } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { cpus } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { root } from "./lib/bundle-core.mjs";

const web = join(root, "apps", "web");
const PORT = 4179;
const SECONDS = Number(process.env.BENCH_SECONDS ?? 20);
const { chromium } = createRequire(join(web, "package.json"))("@playwright/test");

execSync("pnpm exec vite build", { cwd: web, stdio: "ignore" });
const assets = join(web, "dist", "assets");
const bundle = readdirSync(assets)
  .filter((f) => /\.(js|css)$/.test(f))
  .map((f) => {
    const buf = readFileSync(join(assets, f));
    return { file: f, bytes: statSync(join(assets, f)).size, gzipBytes: gzipSync(buf).length };
  });

const server = spawn("pnpm", ["exec", "vite", "preview", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: web, stdio: "ignore" });
const base = `http://127.0.0.1:${PORT}/`;
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(base)).ok) break;
  } catch {
    // not listening yet
  }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required"] });
const results = [];
try {
  for (const renderer of ["webgl", "canvas"]) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const url = base + (renderer === "canvas" ? "?renderer=canvas" : "");
    await page.goto(url);
    await page.evaluate(() => localStorage.clear());
    const t0 = Date.now();
    await page.goto(url);
    await page.getByRole("heading", { level: 1 }).waitFor();
    const firstLoadMs = Date.now() - t0;
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      const fcp = performance.getEntriesByName("first-contentful-paint")[0];
      return { domContentLoadedMs: Math.round(n.domContentLoadedEventEnd), firstContentfulPaintMs: fcp ? Math.round(fcp.startTime) : null };
    });
    await page.locator(".example").first().click();
    await page.getByTestId("compose").click();
    await page.locator('.stepper button[data-stage="perform"]').click();
    await page.getByTestId("begin").click();
    await page.waitForTimeout(SECONDS * 1000);
    await page.getByTestId("stop").click();
    const metrics = await page.evaluate(() => JSON.parse(localStorage.getItem("unperformed.session.v1") ?? "{}").metrics);
    const perf = metrics?.performances?.at(-1) ?? null;
    results.push({ renderer, firstLoadMs, ...nav, compileMs: (metrics?.compileMs ?? []).map((x) => Math.round(x * 10) / 10), seconds: SECONDS, frames: perf });
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}

const env = { chromium: browser.version(), cpu: cpus()[0]?.model ?? "unknown", cores: cpus().length, gl: "SwiftShader (software)", viewport: "1440x900", date: new Date().toISOString() };
console.log(`UNPERFORMED browser benchmark — Chromium ${env.chromium}, ${env.gl}, ${env.cpu} × ${env.cores}`);
console.table(bundle.map((b) => ({ file: b.file, KB: +(b.bytes / 1024).toFixed(1), "gzip KB": +(b.gzipBytes / 1024).toFixed(1) })));
console.table(
  results.map((r) => ({
    renderer: r.renderer,
    "first load ms": r.firstLoadMs,
    "DOMContentLoaded ms": r.domContentLoadedMs,
    "compile ms": r.compileMs.join(", "),
    "avg fps": r.frames?.avgFps,
    "p95 frame ms": r.frames?.p95FrameMs,
    frames: r.frames?.frames
  }))
);
const out = join(root, "docs", "evaluation");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "bench-browser.json"), JSON.stringify({ env, bundle, results }, null, 2) + "\n");
