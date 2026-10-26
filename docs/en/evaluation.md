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
| Core unit tests (vitest) | `pnpm --filter @unperformed/performance-core test` | 106 | all pass |
| Web unit tests (vitest) | `pnpm --filter @unperformed/web test` | 18 | all pass |
| End to end (Playwright, desktop 1440×900 and Pixel 7) | `pnpm test:e2e` | 14 × 2 projects = 28 | all pass |
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
- **Adaptive quality:** the controller (budget, warm-up, pauses ignored,
  occasional slow frames tolerated, no step back up, fixed modes) in unit
  tests; in the browser, frames slowed to 30 ms drop the WebGL stage to
  reduced quality and the HUD and review say so, and `?quality=full` stays at
  full quality.
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

- 4-core Intel Xeon Linux container, **no GPU** (2.10 GHz for the core
  timings, 2.80 GHz for the browser run; the container host varies).
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

Production build served by `vite preview`, measured in the environment above
on 2026-10-26. Each run played the 76 s demo score for 20 s. `full` and
`reduced` fix the quality with `?quality=`; `auto` is what users get.

| | WebGL full | WebGL reduced | WebGL auto | Canvas2D |
| --- | --- | --- | --- | --- |
| First load to heading visible | 100 ms | 69 ms | 82 ms | 74 ms |
| DOMContentLoaded | 59 ms | 30 ms | 33 ms | 27 ms |
| Score compile in the browser | 2.1 ms | 2.0 ms | 2.1 ms | 2.2 ms |
| Average frame rate during performance | **10 fps** | **20 fps** | 18 fps | 60 fps |
| 95th percentile frame time | 118.7 ms | 59.0 ms | 103.9 ms | 17.0 ms |
| Quality at the end | full | reduced | reduced | full |

Bundle: the initial JavaScript is 339 KB (105 KB gzip), plus 33 KB of CSS
(13 KB gzip). three.js and the WebGL stage are a separate 471 KB chunk (119 KB
gzip), loaded the first time a stage appears (Compose, Rehearse, Perform).
Before this split everything was one 784 KB file (216 KB gzip).

These numbers include the art direction per section type (a visible light
beam, floor lines and moving haze, see `apps/web/src/stage/look.ts`). Before
it, the same benchmark measured 12 fps full and 26 fps reduced. On SwiftShader
every extra transparent surface costs CPU time; the cost on a GPU is not
measured.

**What this means.** 10 fps is what a CPU emulating a GPU achieves; it is a
floor, not the experience on a normal computer. Reduced quality doubles it
here, but software WebGL still misses the 20 ms budget. The `auto` column mixes
the frames before and after the switch. The 2D renderer runs at the display
rate in the same environment. Load times are from a local server, so they
exclude network transfer.

In the same environment, halving the viewport (720×450, a quarter of the
pixels) took full quality from 12 to 41 fps, while halving the elements and
removing the haze alone gained about 2 fps. The stage is fill-bound, which is
why reduced quality also lowers the resolution.

The in-app frame rate (shown in the performance HUD and the review) is measured
from `requestAnimationFrame` intervals while a performance plays.

## Adaptive quality

The stage measures its own frame intervals from the first frame. After 20
warm-up frames it groups them into consecutive windows of about one second
(120 frames at most, 10 at least). If the 95th percentile is above **20 ms** in
**three windows in a row** it switches to reduced quality. A hitch shorter
than a second can never fill three windows, so it is ignored. (The first
version reduced after a single two-second window; on an iPhone 17 Pro that
reduced quality in every auto run although full quality ran within budget,
see below.)

| | Full | Reduced |
| --- | --- | --- |
| Elements drawn | 240 | 120 (every second one, so forms keep their shape) |
| Haze | on | off |
| Pixel ratio | device, capped at 2 | 1 × 0.7 (about half the pixels at 1×, a sixth at 3×) |

The choreography, timeline, light colours and safety limits are the same. The
switch only goes down: a slow device would otherwise flip between levels in the
middle of a performance. Once one stage on the page has reduced, later stages
on that page start reduced. Pauses longer than 250 ms (a hidden tab) are
ignored. The HUD and the review show "reduced quality" when it happened.

Override with `?quality=full` or `?quality=reduced` (for example to measure).

## Real hardware

Measured by the project owner on 2026-10-26 on the public demo (demo mode),
one full performance per row, values read from the in-app review. Each value
comes from one run.

| Device | Browser | WebGL full | WebGL auto | Canvas2D |
| --- | --- | --- | --- | --- |
| Microsoft Surface Laptop 7th Edition, Snapdragon X X1P64100 (10 cores, 3.4 GHz), Windows 11 (ARM64) | Microsoft Edge | **68 fps**, p95 18.6 ms | **68 fps**, p95 18.9 ms, stayed at full quality | not measured |
| Apple iPhone 17 Pro, iOS | Safari | **60 fps**, p95 18 ms | 60 fps, p95 17 ms; 60 fps, p95 17 ms; 59 fps, p95 18 ms; all three switched to reduced quality (first rule, see below) | not measured |
| Mid-range phone | — | not measured | not measured | not measured |

**What this means.** On this laptop the full stage runs within the 20 ms p95
budget, so auto keeps full quality, as intended. The p95 is close to the
budget (about 1 ms under), so a slower integrated GPU, a larger window or a
busy machine would likely switch to reduced quality. The display's refresh
rate and the window size were not recorded, and an average of 68 fps shows the
display is faster than 60 Hz; the GL renderer string was not recorded either.

On the iPhone, Safari limits `requestAnimationFrame` to 60 Hz, so 60 fps is the
ceiling there, and full quality reached it with a p95 of 18 ms, inside the
budget. The full-quality run was stopped before the end (the review logs a
stop). The three auto runs used the first rule (one two-second window over
budget), which reduced quality every time, most likely on short hitches; that
is why the rule now needs three slow one-second windows in a row. The auto
column has not been measured again with the new rule, and no mid-range phone
has been measured.

How to measure:

- **Desktop with a GPU.** `pnpm install`, then
  `pnpm --filter @unperformed/web exec playwright install chromium` once, then
  `BENCH_GPU=1 pnpm bench:browser`. A visible Chromium window opens on this
  machine's GPU; leave it in front and do not use the computer until it closes
  (about 2 minutes). Results, including the GL renderer string, are written to
  `docs/evaluation/bench-browser-gpu.json`.
- **Phone.** Turn off battery saver (it caps the frame rate) and open the
  public demo at
  [`https://joojoohappy.github.io/Unperformed/?quality=full`](https://joojoohappy.github.io/Unperformed/?quality=full)
  (or, for a local build, `pnpm build` and
  `pnpm --filter @unperformed/web exec vite preview --host` on a computer on the
  same Wi-Fi, then `http://<computer's LAN IP>:4173/?quality=full`). Choose an example, go to Perform, let the whole
  performance play, and open Review: "Performance FPS" shows the average frame
  rate, p95 frame time and renderer. Repeat without `?quality=full` (auto) and
  with `?renderer=canvas`. Record the phone model and browser version.

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
