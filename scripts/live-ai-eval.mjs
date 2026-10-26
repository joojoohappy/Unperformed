#!/usr/bin/env node
// Runs the studio end to end in Live AI mode against the real Claude API and
// records what happened.
//
//   ANTHROPIC_API_KEY=... pnpm eval:live
//
// For each example idea (3 in English, 3 in Traditional Chinese) it starts a
// fresh session, switches to Live AI, composes, approves the proposed
// constraints, then sends four suggested requests in turn (explode at the
// climax, more chaos, faster, warm ending), asks for the combined version when
// the co-director offers one, and resolves each round. It saves:
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
  console.error(
    "ANTHROPIC_API_KEY is not set. This script makes real, billed API calls; see docs/en/evaluation.md.",
  );
  process.exit(1);
}

const web = join(root, "apps", "web");
const ai = join(root, "services", "ai");
const PORT = 5182;
const BASE = `http://127.0.0.1:${PORT}/`;
const date = new Date().toISOString().slice(0, 10);
const out = join(root, "evaluation", "live-ai", date);
const { chromium } = createRequire(join(web, "package.json"))(
  "@playwright/test",
);

const SESSION_KEY = "unperformed.session.v1";
const PREFS_KEY = "unperformed.prefs.v1";
const APPROVE = { en: "Approve", "zh-TW": "核准" };
const DISCARD = { en: "Discard", "zh-TW": "捨棄" };
// The suggested requests sent in order: explode at the climax, more chaos,
// faster, warm ending (apps/web/src/i18n, negotiate.suggest.N).
const REQUESTS = [1, 6, 7, 5];
// Optional comma-separated subset of runs, e.g. UNPERFORMED_EVAL_ONLY=en-2,zh-TW-1.
const only = process.env.UNPERFORMED_EVAL_ONLY?.split(",").map((t) => t.trim());

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

// Errors that will fail every later run too, so the script stops instead of
// paying for (or waiting on) five more.
const isFatal = (e) =>
  e.code === "not_configured" || /HTTP 40[13]|connection error/.test(e.message);

/**
 * Waits for `ready()` to hold, but gives up as soon as a matching /api call
 * made after `since` has come back as an error: a failed interpret leaves the
 * studio on Imagine, so the next button never appears.
 */
async function until(page, ready, calls, kind, since = 0, timeoutMs = 180000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    if (await ready()) return;
    const failed = calls
      .slice(since)
      .find((c) => c.kind === kind && c.status >= 400);
    if (failed) throw new CallFailed(kind, failed.error);
    await page.waitForTimeout(250);
  }
  throw new Error(`timed out after ${timeoutMs} ms waiting for ${kind}`);
}

class CallFailed extends Error {
  constructor(kind, error) {
    const code =
      typeof error === "object" && error ? error.code : String(error);
    super(
      `${kind} failed: ${code}${error?.detail ? ` (${error.detail})` : ""}`,
    );
    this.code = code;
    this.name = "CallFailed";
  }
}

/**
 * Sends one suggested request, asks for the combined version when the
 * co-director objects, then resolves the round: combined, the director's
 * version, keep (for a constraint conflict), or the person's own, whichever
 * comes first and is allowed.
 */
async function negotiateOnce(page, n, calls) {
  const rounds = page.getByTestId("round");
  const before = await rounds.count();
  const since = calls.length;
  await page.getByTestId(`suggest-${n}`).click();
  await page.getByTestId("send-request").click();
  await until(
    page,
    async () => (await rounds.count()) > before,
    calls,
    "negotiate",
    since,
  );
  const latest = rounds.first();
  const combine = latest.getByTestId("combine");
  if (await combine.count()) {
    const sinceCombine = calls.length;
    await combine.click();
    // Only the climax asks the model for the combined version; the rest come
    // from the rules. Wait for the combined option either way.
    await until(
      page,
      async () => (await latest.getByTestId("choose-combined").count()) > 0,
      calls,
      "combine",
      sinceCombine,
    );
  }
  for (const id of ["combined", "ai", "keep", "human"]) {
    const b = latest.getByTestId(`choose-${id}`);
    if ((await b.count()) && (await b.isEnabled())) {
      await b.click();
      return;
    }
  }
}

async function run(page, locale, n, calls) {
  await page.goto(`${BASE}?lang=${locale}`);
  await page.evaluate(
    ([key, prefs]) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(prefs));
    },
    [PREFS_KEY, { reducedMotion: true, sound: false }],
  );
  await page.goto(`${BASE}?lang=${locale}`);
  const liveBtn = page.getByTestId("mode-live");
  await liveBtn.waitFor();
  await page.waitForFunction(
    () =>
      !document
        .querySelector('[data-testid="mode-live"]')
        ?.hasAttribute("disabled"),
    null,
    { timeout: 15000 },
  );
  await liveBtn.click();

  await page.locator(".example").nth(n).click();
  await page.getByTestId("compose").click();
  await until(
    page,
    async () => (await page.getByTestId("to-negotiate").count()) > 0,
    calls,
    "interpret",
  );
  // Approve every proposed constraint. The engine refuses one the plan does
  // not satisfy; that one is discarded instead and reported.
  const blocked = [];
  const proposed = page.locator("li.constraint.is-proposed");
  for (let i = 0; i < 10 && (await proposed.count()); i++) {
    const item = proposed.first();
    const text = await item.locator(".constraint-text").innerText();
    if (!blocked.includes(text)) {
      await item
        .getByRole("button", { name: APPROVE[locale], exact: true })
        .click({ timeout: 10000 });
      await page.waitForTimeout(300);
      if (
        (await proposed.count()) &&
        (await proposed.first().locator(".constraint-text").innerText()) ===
          text
      ) {
        blocked.push(text);
      }
      continue;
    }
    await item
      .getByRole("button", { name: DISCARD[locale], exact: true })
      .click({ timeout: 10000 });
  }
  await page.getByTestId("to-negotiate").click();
  for (const n of REQUESTS) await negotiateOnce(page, n, calls);
  const session = await page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    SESSION_KEY,
  );
  return { session, blocked };
}

function stats(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return {
    n: s.length,
    median: s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2,
    max: s[s.length - 1],
  };
}

async function main() {
  mkdirSync(out, { recursive: true });
  const service = spawn(
    "uv",
    ["run", "uvicorn", "unperformed_ai.app:app", "--port", "8787"],
    { cwd: ai, stdio: "inherit" },
  );
  const vite = spawn(
    "pnpm",
    [
      "exec",
      "vite",
      "--port",
      String(PORT),
      "--strictPort",
      "--host",
      "127.0.0.1",
    ],
    { cwd: web, stdio: "ignore" },
  );
  const all = [];
  const runs = [];
  try {
    await waitFor("http://127.0.0.1:8787/api/health", "Live AI service");
    await waitFor(BASE, "vite dev server");
    const health = await (
      await fetch("http://127.0.0.1:8787/api/health")
    ).json();
    if (!health.liveAvailable)
      throw new Error("service reports Live AI unavailable");

    let fatal = null;
    const browser = await chromium.launch({
      args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
    });
    for (const locale of ["en", "zh-TW"]) {
      for (let n = 0; n < 3; n++) {
        const context = await browser.newContext({
          viewport: { width: 1280, height: 900 },
        });
        // Without a default, a click on a button that never becomes
        // actionable waits forever.
        context.setDefaultTimeout(60000);
        const page = await context.newPage();
        const calls = [];
        page.on("response", async (res) => {
          const m = /\/api\/(interpret|negotiate|combine)$/.exec(
            new URL(res.url()).pathname,
          );
          if (!m) return;
          let body = null;
          try {
            body = await res.json();
          } catch {
            // recorded as unreadable below
          }
          calls.push({
            kind: m[1],
            status: res.status(),
            meta: body?.meta ?? null,
            error: res.ok() ? null : (body?.detail ?? `HTTP ${res.status()}`),
            body,
          });
        });
        const tag = `${locale}-${n + 1}`;
        if (only && !only.includes(tag)) {
          await context.close();
          continue;
        }
        let session = null;
        let blocked = [];
        let failure = null;
        try {
          ({ session, blocked } = await run(page, locale, n, calls));
        } catch (e) {
          failure = String(e);
          console.error(`${tag}: ${failure}`);
          await page
            .screenshot({ path: join(out, `${tag}.failure.png`) })
            .catch(() => {});
          if (e instanceof CallFailed && isFatal(e)) fatal = e;
        }
        if (session)
          writeFileSync(
            join(out, `${tag}.session.json`),
            JSON.stringify(session, null, 2),
          );
        writeFileSync(
          join(out, `${tag}.calls.json`),
          JSON.stringify({ calls, failure }, null, 2),
        );
        all.push(...calls.map((c) => ({ ...c, run: tag })));
        runs.push({
          run: tag,
          ok: !failure,
          failure,
          interpretation: session?.interpretationSource ?? null,
          blockedConstraints: blocked,
          rounds: (session?.rounds ?? []).map((r) => ({
            request: r.request?.text,
            requestKind: r.request?.kind,
            requestSource: r.request?.source?.kind,
            round: r.kind,
            chosen: r.resolution?.optionId ?? null,
          })),
        });
        console.log(
          `${tag}: ${calls.map((c) => `${c.kind} ${c.status} ${c.meta?.latencyMs ?? "-"}ms`).join(", ")}${failure ? " (run failed)" : ""}`,
        );
        await context.close();
        if (fatal) break;
      }
      if (fatal) break;
    }
    await browser.close();
    if (fatal) console.error(`Stopped early: ${fatal.message}`);
  } finally {
    service.kill();
    vite.kill();
  }

  const byKind = {};
  for (const kind of ["interpret", "negotiate", "combine"]) {
    const ok = all.filter((c) => c.kind === kind && c.meta);
    byKind[kind] = {
      calls: all.filter((c) => c.kind === kind).length,
      failures: all
        .filter((c) => c.kind === kind && !c.meta)
        .map((c) => ({ run: c.run, error: c.error })),
      latencyMs: stats(ok.map((c) => c.meta.latencyMs)),
      attempts: stats(ok.map((c) => c.meta.attempts)),
      inputTokens: stats(ok.map((c) => c.meta.inputTokens)),
      outputTokens: stats(ok.map((c) => c.meta.outputTokens)),
      costUsd: ok.reduce((a, c) => a + (c.meta.estimatedCostUsd ?? 0), 0),
    };
  }
  const models = [
    ...new Set(all.filter((c) => c.meta).map((c) => c.meta.model)),
  ];
  const summary = {
    date,
    models,
    runs,
    totalCostUsd: Object.values(byKind).reduce((a, k) => a + k.costUsd, 0),
    byKind,
  };
  writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

await main();
