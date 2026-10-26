#!/usr/bin/env node
// Runs the studio end to end in Live AI mode against the real Claude API and
// records what happened.
//
//   ANTHROPIC_API_KEY=... pnpm eval:live
//
// For each example idea (3 in English, 3 in Traditional Chinese) it starts a
// fresh session, switches to Live AI, composes, approves the proposed
// constraints, sends the climax request, asks for the combined version when
// the co-director objects, and opens the review. It saves:
//
//   evaluation/live-ai/<date>/<locale>-<n>.session.json   the session export
//   evaluation/live-ai/<date>/<locale>-<n>.calls.json     every /api response (meta: latency, attempts, tokens, cost)
//   evaluation/live-ai/<date>/summary.json                aggregates per call type
//
// Every number comes from a real response. A call that fails is recorded as a
// failure with its error code, never replaced. This script costs money.
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { root } from "./lib/bundle-core.mjs";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. This script makes real, billed API calls; see docs/en/evaluation.md.");
  process.exit(1);
}

const web = join(root, "apps", "web");
const ai = join(root, "services", "ai");
const PORT = 5182;
const BASE = `http://127.0.0.1:${PORT}/`;
const date = new Date().toISOString().slice(0, 10);
const out = join(root, "evaluation", "live-ai", date);
const { chromium } = createRequire(join(web, "package.json"))("@playwright/test");

const SESSION_KEY = "unperformed.session.v1";
const PREFS_KEY = "unperformed.prefs.v1";
const APPROVE = { en: "Approve", "zh-TW": "核准" };

async function waitFor(url, what) {
  for (let i = 0; i < 240; i++) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`${what} did not start`);
}

async function run(page, locale, n, calls) {
  await page.goto(`${BASE}?lang=${locale}`);
  await page.evaluate(
    ([key, prefs]) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(prefs));
    },
    [PREFS_KEY, { reducedMotion: true, sound: false }]
  );
  await page.goto(`${BASE}?lang=${locale}`);
  const liveBtn = page.getByTestId("mode-live");
  await liveBtn.waitFor();
  await page.waitForFunction(() => !document.querySelector('[data-testid="mode-live"]')?.hasAttribute("disabled"), null, { timeout: 15000 });
  await liveBtn.click();

  await page.locator(".example").nth(n).click();
  await page.getByTestId("compose").click();
  await page.getByTestId("to-negotiate").waitFor({ timeout: 180000 });
  const approve = page.getByRole("button", { name: APPROVE[locale], exact: true });
  while (await approve.count()) await approve.first().click();

  await page.getByTestId("to-negotiate").click();
  await page.getByTestId("suggest-1").click();
  await page.getByTestId("send-request").click();
  await page.getByTestId("round").last().waitFor({ timeout: 180000 });

  if (await page.getByTestId("combine").count()) {
    await page.getByTestId("combine").click();
    // Wait for the combine response itself, success or failure, then let the UI settle.
    for (let i = 0; i < 720 && !calls.some((c) => c.kind === "combine"); i++) await page.waitForTimeout(250);
    await page.waitForTimeout(500);
  }
  for (const id of ["combined", "ai", "human"]) {
    const b = page.getByTestId(`choose-${id}`);
    if ((await b.count()) && (await b.isEnabled())) {
      await b.click();
      break;
    }
  }
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)), SESSION_KEY);
}

function stats(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return { n: s.length, median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2, max: s[s.length - 1] };
}

async function main() {
  mkdirSync(out, { recursive: true });
  const service = spawn("uv", ["run", "uvicorn", "unperformed_ai.app:app", "--port", "8787"], { cwd: ai, stdio: "inherit" });
  const vite = spawn("pnpm", ["exec", "vite", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: web, stdio: "ignore" });
  const all = [];
  try {
    await waitFor("http://127.0.0.1:8787/api/health", "Live AI service");
    await waitFor(BASE, "vite dev server");
    const health = await (await fetch("http://127.0.0.1:8787/api/health")).json();
    if (!health.liveAvailable) throw new Error("service reports Live AI unavailable");

    const browser = await chromium.launch({ args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
    for (const locale of ["en", "zh-TW"]) {
      for (let n = 0; n < 3; n++) {
        const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
        const page = await context.newPage();
        const calls = [];
        page.on("response", async (res) => {
          const m = /\/api\/(interpret|negotiate|combine)$/.exec(new URL(res.url()).pathname);
          if (!m) return;
          let body = null;
          try {
            body = await res.json();
          } catch {
            // recorded as unreadable below
          }
          calls.push({ kind: m[1], status: res.status(), meta: body?.meta ?? null, error: res.ok() ? null : (body?.detail ?? `HTTP ${res.status()}`), body });
        });
        const tag = `${locale}-${n + 1}`;
        let session = null;
        let failure = null;
        try {
          session = await run(page, locale, n, calls);
        } catch (e) {
          failure = String(e);
          console.error(`${tag}: ${failure}`);
        }
        if (session) writeFileSync(join(out, `${tag}.session.json`), JSON.stringify(session, null, 2));
        writeFileSync(join(out, `${tag}.calls.json`), JSON.stringify({ calls, failure }, null, 2));
        all.push(...calls.map((c) => ({ ...c, run: tag })));
        console.log(`${tag}: ${calls.map((c) => `${c.kind} ${c.status} ${c.meta?.latencyMs ?? "-"}ms`).join(", ")}${failure ? " (run failed)" : ""}`);
        await context.close();
      }
    }
    await browser.close();
  } finally {
    service.kill();
    vite.kill();
  }

  const byKind = {};
  for (const kind of ["interpret", "negotiate", "combine"]) {
    const ok = all.filter((c) => c.kind === kind && c.meta);
    byKind[kind] = {
      calls: all.filter((c) => c.kind === kind).length,
      failures: all.filter((c) => c.kind === kind && !c.meta).map((c) => ({ run: c.run, error: c.error })),
      latencyMs: stats(ok.map((c) => c.meta.latencyMs)),
      attempts: stats(ok.map((c) => c.meta.attempts)),
      inputTokens: stats(ok.map((c) => c.meta.inputTokens)),
      outputTokens: stats(ok.map((c) => c.meta.outputTokens)),
      costUsd: ok.reduce((a, c) => a + (c.meta.estimatedCostUsd ?? 0), 0)
    };
  }
  const models = [...new Set(all.filter((c) => c.meta).map((c) => c.meta.model))];
  const summary = { date, models, runs: 6, totalCostUsd: Object.values(byKind).reduce((a, k) => a + k.costUsd, 0), byKind };
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

await main();
