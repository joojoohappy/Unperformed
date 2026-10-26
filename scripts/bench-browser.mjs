#!/usr/bin/env node
// Measures the built web studio in Chromium: bundle size, first load,
// compile latency and frame rate for both renderers and both quality modes.
// Every value is measured in this run, and the GL renderer string is read from
// the browser, so the JSON says what actually drew the frames.
//
//   pnpm bench:browser               -> headless, WebGL on SwiftShader (a CPU rasteriser; a floor)
//   BENCH_GPU=1 pnpm bench:browser   -> headed window on this machine's GPU
//   BENCH_SECONDS=30 ...             -> seconds per run (default 20)
//
// Writes docs/evaluation/bench-browser.json (or bench-browser-gpu.json with BENCH_GPU=1).
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
const GPU = process.env.BENCH_GPU === "1";
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

const flags = ["--autoplay-policy=no-user-gesture-required"];
const browser = await chromium.launch(
  GPU ? { headless: false, args: [...flags, "--ignore-gpu-blocklist"] } : { args: [...flags, "--use-gl=swiftshader", "--enable-unsafe-swiftshader"] }
);
const runs = [
  { renderer: "webgl", quality: "full" },
  { renderer: "webgl", quality: "reduced" },
  { renderer: "webgl", quality: "auto" },
  { renderer: "canvas", quality: "full" }
];
const results = [];
let gl = "unknown";
try {
  for (const { renderer, quality } of runs) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const params = new URLSearchParams();
    if (renderer === "canvas") params.set("renderer", "canvas");
    if (quality !== "auto") params.set("quality", quality);
    const url = base + (params.size ? `?${params}` : "");
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
    if (renderer === "webgl")
      gl = await page.evaluate(() => {
        const c = document.createElement("canvas").getContext("webgl2") ?? document.createElement("canvas").getContext("webgl");
        const ext = c?.getExtension("WEBGL_debug_renderer_info");
        return c ? String(ext ? c.getParameter(ext.UNMASKED_RENDERER_WEBGL) : c.getParameter(c.RENDERER)) : "unavailable";
      });
    await page.locator(".example").first().click();
    await page.getByTestId("compose").click();
    await page.locator('.stepper button[data-stage="perform"]').click();
    await page.getByTestId("begin").click();
    await page.waitForTimeout(SECONDS * 1000);
    await page.getByTestId("stop").click();
    const metrics = await page.evaluate(() => JSON.parse(localStorage.getItem("unperformed.session.v1") ?? "{}").metrics);
    const perf = metrics?.performances?.at(-1) ?? null;
    results.push({ renderer, quality, firstLoadMs, ...nav, compileMs: (metrics?.compileMs ?? []).map((x) => Math.round(x * 10) / 10), seconds: SECONDS, frames: perf });
    await page.close();
  }
} finally {
  await browser.close();
  server.kill();
}

const env = { chromium: browser.version(), cpu: cpus()[0]?.model ?? "unknown", cores: cpus().length, gl, mode: GPU ? "headed, GPU" : "headless, SwiftShader", viewport: "1440x900", date: new Date().toISOString() };
console.log(`UNPERFORMED browser benchmark — Chromium ${env.chromium}, ${env.mode}, ${env.gl}, ${env.cpu} × ${env.cores}`);
console.table(bundle.map((b) => ({ file: b.file, KB: +(b.bytes / 1024).toFixed(1), "gzip KB": +(b.gzipBytes / 1024).toFixed(1) })));
console.table(
  results.map((r) => ({
    renderer: r.renderer,
    "quality mode": r.quality,
    "quality at end": r.frames?.quality,
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
writeFileSync(join(out, GPU ? "bench-browser-gpu.json" : "bench-browser.json"), JSON.stringify({ env, bundle, results }, null, 2) + "\n");
