# Architecture

[繁體中文](../zh-TW/architecture.md)

UNPERFORMED is split into three parts that each have a single job.

```
┌──────────────────────────── apps/web (browser) ────────────────────────────┐
│  React studio: Imagine · Compose · Negotiate · Rehearse · Perform · Review  │
│                                                                             │
│  ai/director.ts ── demo rules ──┐        session reducer (event log)        │
│        │                        ▼                   │                       │
│        │ Live AI      packages/performance-core     ▼                       │
│        │ (fetch)      schema · compiler · patch · negotiation · timeline   │
│        │                        │                                          │
│        │                        ▼  StageFrame (pure function of beat)       │
│        │        Stage: WebGL (three.js) or Canvas2D   Audio: Web Audio      │
│        │                 ▲ beat                         │ master clock      │
│        │                 └──────── playback/transport ◀─┘                   │
└────────┼────────────────────────────────────────────────────────────────────┘
         │ /api (Vite proxy in development)
┌────────▼──────────── services/ai (optional, holds the API key) ─────────────┐
│  FastAPI · Pydantic contracts · Claude structured outputs · retry · usage   │
└─────────────────────────────────────────────────────────────────────────────┘
```

## packages/performance-core

Plain TypeScript with one dependency (zod). No DOM, no network, no clock. Every
function is deterministic, so the browser, the tests and the benchmark all run
the same code.

| Module | Responsibility |
| --- | --- |
| `schema.ts` | The **Performance Score**: sections with energy, geometry, lighting, camera, sound, transition and release, plus palette, constraints and `humanLocked`. Cross-field rules (contiguous sections, release only on a climax, unique ids) are checked in `superRefine`. |
| `interpretation.ts` | The **Interpretation**: the only thing a planner (rules or model) produces. It is small and creative (phases, moods, a climax, proposed constraints) and has no timing. `.strict()` so unknown fields are rejected. |
| `compiler.ts` | Interpretation → Score. Allocates bars with the largest remainder method, derives each section's parameters from its archetype and mood, and makes routine "AI-local" decisions (camera moves) with a stated reason. The output is validated before it is returned. |
| `patch.ts` | The only way to change a score: typed patch operations, the **authority policy** (`authorityOf`) and `applyPatch`, which is all-or-nothing. |
| `constraints.ts` | Each constraint kind is a precise predicate on the score. |
| `negotiation.ts` | Change requests, the director's response, options with exact diffs, combined options and session memory. |
| `timeline.ts` | `sample(score, beat)` → `StageFrame`. A pure function of time: release holds, transitions, blackout, flicker limits, camera poses, reduced motion. |
| `safety.ts` | A WCAG 2.3.1 general-flash check over the sampled timeline. |
| `effects.ts` | Renderer capabilities and the form fallback chain. |
| `demoPlanner.ts` | The deterministic rule-based planner for demo mode (English and Traditional Chinese cues). |
| `session.ts` | The session reducer and typed event log. Every human, AI and system action is an event with an actor. |
| `review.ts` | Builds the review only from recorded events and the two scores. |

## apps/web

Vite, React 18 and three.js. The studio holds no creative logic of its own: it
dispatches actions to the core's reducer, renders `StageFrame`s and plays sound.

- **Transport.** The Web Audio clock is the master clock while sound is on;
  the stage asks the transport for the current beat on every animation frame.
  When sound is off or unavailable, a `performance.now()` clock takes over.
- **Stage.** `stage/layout.ts` turns a frame into per-element transforms for
  240 instanced elements. `webgl.ts` (three.js, instanced mesh, spot and rim
  lights, haze) and `canvas2d.ts` (flat projection) draw the same layout. The
  2D renderer is used when WebGL is missing or `?renderer=canvas` is set.
  `stage/look.ts` holds the art direction per section type (light, fog, haze,
  floor, motion); the frame's `look` field says which section type to use and
  how far a transition has blended it. `webgl.ts` and three.js are loaded on
  demand, so the first screens do not download them.
- **Audio.** `audio/engine.ts` schedules oscillators, filtered noise and
  envelopes per section: a bed chosen by the sound texture, plus a voice chosen
  by the section type. Everything is seeded from the score. Nothing is sampled
  or downloaded. `renderOffline`
  renders the same score through an `OfflineAudioContext`.
- **AI client.** `ai/director.ts` chooses demo rules or the Live AI service.
  `ai/live.ts` validates every response with zod before it is used.
- **State.** The session and preferences persist in `localStorage`, so a
  reload continues the same session.
- **i18n.** Typed key tables for English and Traditional Chinese. The core
  emits `Text` values (`{ key, params }`) instead of strings, so every message,
  including those in the history, switches language with the interface.

## services/ai

Optional. FastAPI with Pydantic mirrors of the core's contracts. Each endpoint
makes one structured-output call to Claude, validates the reply, retries with
the validation error when needed, and reports latency, attempts, tokens and an
estimated cost. See [services/ai/README.md](../../services/ai/README.md).

The service never edits a score. It returns an Interpretation or advice, and
the browser passes that through the same deterministic compiler and authority
checks as demo rules.

## Data flow of one session

1. **Imagine.** Text → planner (rules or model) → `Interpretation`.
2. **Compose.** `compile()` → validated `PerformanceScore`. Constraints arrive as
   `proposed`; the person approves or removes them.
3. **Negotiate.** A request → `openRound()` → options with exact diffs. The
   chosen option is applied with `applyPatch`.
4. **Rehearse.** Scrub the timeline; human edits are patches with
   `actor: "human"` and become `humanLocked`.
5. **Perform.** Transport + `sample()` + renderer + audio. Pause, blackout and
   master light are recorded as interventions.
6. **Review.** `buildReview()` reads the event log and the original and final
   scores. Nothing is generated after the fact.
