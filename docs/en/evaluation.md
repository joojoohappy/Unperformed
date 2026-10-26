# Evaluation

[繁體中文](../zh-TW/evaluation.md)

What has been tested and measured, how, and what the numbers do and do not
mean. Every number below was measured on the machine described; nothing is
estimated or borrowed. Raw results are in
[`docs/evaluation/bench-core.json`](../evaluation/bench-core.json) and
[`docs/evaluation/bench-browser.json`](../evaluation/bench-browser.json).

## Test suites

| Suite | Command | Tests | Result (2026-10-26) |
| --- | --- | --- | --- |
| Core unit tests (vitest) | `pnpm --filter @unperformed/performance-core test` | 101 | all pass |
| Web unit tests (vitest) | `pnpm --filter @unperformed/web test` | 5 | all pass |
| End to end (Playwright, desktop 1440×900 and Pixel 7) | `pnpm test:e2e` | 11 × 2 projects = 22 | all pass |
| Live AI service (pytest) | `pnpm test:ai` | 28 | all pass; ruff and mypy (strict) clean |
| Lint and types | `pnpm lint && pnpm typecheck` | | clean |

What they cover:

- **Schema:** valid and invalid scores, cross-field rules, JSON Schema export.
- **Authority:** each level, locked fields, approval, constraint preservation
  for every actor, all-or-nothing application.
- **Negotiation:** the climax, warm-ending, more-chaos and tempo proposals,
  no objection when there is no genuine difference, combined option, deferral
  on repeat, constraint conflict with keep / alternative / unlock, safety
  notice, out-of-range or uninvited model advice.
- **Invalid model output:** shared fixtures (wrong climax index, unknown enum,
  extra field, too few phases) are rejected by both zod and Pydantic; the
  service retries with the validation error and reports `invalid_model_output`
  after the last attempt. (The browser also validates every service response
  with zod before use; that path is not yet covered by its own test.)
- **Timeline and replay:** determinism (`timelineFingerprint`), release holds,
  blackout, reduced motion, flicker cap, flash check.
- **Rendering fallback:** form substitution chain and renderer choice; in the
  browser, `?renderer=canvas` runs a performance on the 2D renderer.
- **Session:** the reducer, event log and review.
- **i18n:** key and placeholder parity between English and Traditional Chinese,
  and coverage of every key the core emits.
- **End to end:** the full six-stage workflow in demo mode (with no console
  errors), constraint conflicts and safety, the Traditional Chinese interface,
  persistence across reload, the 2D fallback, and Live AI with the service
  mocked at the network boundary (model labelling, usage recording, a failing
  negotiation call falling back to rules with a label, a failing
  interpretation reported without inventing a result).

## Environment for measurements

- 4-core Intel Xeon @ 2.10 GHz Linux container, **no GPU**.
- Node.js 22.22.0.
- Headless Chromium 153 (Playwright 1.63), **WebGL rendered on the CPU by
  SwiftShader**, viewport 1440×900.

## Core timings (`pnpm bench`)

Median and 95th percentile over many runs after warm-up.

| Step | Runs | Median | p95 |
| --- | --- | --- | --- |
| Demo planner (`demoInterpret`) | 2000 | 0.006 ms | 0.009 ms |
| Compile Interpretation → validated score | 2000 | 0.09 ms | 0.24 ms |
| Validate a score (zod) | 2000 | 0.04 ms | 0.10 ms |
| Apply a patch (approve constraints) | 2000 | 0.22 ms | 0.40 ms |
| Open the climax negotiation round | 2000 | 0.90 ms | 1.92 ms |
| Open and resolve a round | 1000 | 1.18 ms | 3.19 ms |
| Sample a 75 s timeline at 60 fps (4,500 frames) | 50 | 2.2 ms | 6.5 ms |
| Flash check of a 75 s timeline at 60 fps | 50 | 3.2 ms | 6.0 ms |

- Sampling one frame costs about 0.5 µs, so the timeline is never the
  bottleneck.
- The timeline is deterministic: compiling the same idea twice gives an
  identical fingerprint.
- Flash check: the demo score has **0** flashes per second; a score with
  maximum flicker in every section also has **0** (limit: 3). The engine's
  2 Hz / 30% cap keeps luminance swings below the 10% flash threshold.

## Browser (`pnpm bench:browser`)

Production build served by `vite preview`, measured in the environment above.
Each renderer ran the 76 s demo score for 20 s.

| | WebGL (SwiftShader) | Canvas2D |
| --- | --- | --- |
| First load to heading visible | 123 ms | 64 ms |
| DOMContentLoaded | 80 ms | 24 ms |
| Score compile in the browser | 2.4 ms | 2.1 ms |
| Average frame rate during performance | **12 fps** | 60 fps |
| 95th percentile frame time | 96 ms | 17 ms |

Bundle: one JavaScript file of 782 KB (216 KB gzip) and 33 KB of CSS (13 KB gzip).

**What this means.** 12 fps is what a CPU emulating a GPU achieves; it is a
floor, not the experience on a normal computer. The 2D renderer runs at the
display rate in the same environment. **No measurements on GPU-backed browsers
or phones have been made yet.** Load times are from a local server, so they
exclude network transfer.

The in-app frame rate (shown in the performance HUD and the review) is measured
from `requestAnimationFrame` intervals while a performance plays.

## Live AI: model calls, latency and cost

**Not measured.** No API key was available while building the MVP, so no real
model call has been made. Nothing in this repository reports a real model's
latency, token usage, cost or output quality.

What is in place to measure it:

- every Live AI response carries `latencyMs`, `attempts`, `inputTokens`,
  `outputTokens` (summed over all attempts) and `estimatedCostUsd`;
- the studio records them per session and shows them in the review telemetry
  (model calls, tokens, cost, latency per call type);
- the session JSON export contains all of it.

How to measure (a follow-up task):

1. Start the service with a key and the studio (`pnpm dev:ai`, `pnpm dev`).
2. In Live AI mode, run the workflow for a set of ideas (for example the three
   examples in each language plus your own), with the climax request in each.
3. Export each session from the review and record the median and maximum
   latency per call type, attempts, tokens and cost, with the model id and
   date.
4. Note any validation retries or fallbacks, which the review records.

In demo mode the review shows 0 model calls and $0, which is a measurement,
not a placeholder.

## User studies

None have been run. Nothing in this project claims user-study findings.
