# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Three more negotiation scenarios with deterministic creative-difference
  rules: a warmer ending (warm afterglow instead of lighting a silent ending),
  more chaos in the fracture (keep the climax the most broken moment) and a
  faster tempo (keep a resting ending at 12 s or more). Slowing down is
  understood and never objected to. See `docs/en/negotiation-protocol.md`.
- The `setTempo` patch operation, classified `shared` by the authority policy.
- A shared `request-kinds.json` fixture that keeps the zod and Pydantic request
  kinds in step.
- Art direction per section type. Order, build, fracture, climax, release,
  silence and drift each have their own light (a visible key beam, its width
  and angle), air (fog, haze that rises or settles), floor (gloss, ruled lines)
  and motion (rows that breathe, elements that climb, a fault line that opens,
  a radial burst, settling, gathering, a slow current). The timeline frame
  carries the section type, blended over each transition; both renderers use it.
- A sound voice per section type, procedural and seeded: a clock for order, a
  quickening arpeggio and riser for build, stereo glitches over a tritone for
  fracture, a wide detuned stack with a riser through the held breath and a
  shimmer after the release for climax, descending FM bells for release, two
  faint distant tones for silence (explicitly silent sections stay silent), and
  a drifting chorus for drift.
- `pnpm media -- stages`: one stage frame per section type and a contact sheet;
  `assets/demo/stages-0.1.0/` keeps the same capture from 0.1.0.

### Changed

- three.js loads when a stage first appears. Initial JavaScript 784 KB → 339 KB
  (216 → 105 KB gzip). On SwiftShader the WebGL rate went from 12 to 10 fps at
  full quality and from 26 to 20 fps at reduced quality with the new art
  direction.

## [0.1.0] - 2026-10-26

First public MVP.

### Added

- The six-stage workflow: Imagine, Compose, Negotiate, Rehearse, Perform, Review.
- `packages/performance-core`: the typed Performance Score and Interpretation
  contracts (zod, exported as JSON Schema), a deterministic compiler, typed
  patches with an authority policy enforced in code, constraint predicates,
  the negotiation engine with session memory, a pure timeline sampler, a WCAG
  2.3.1 flash check, renderer capability fallbacks, a rule-based demo planner
  (English and Traditional Chinese) and the session reducer and event log.
- The climax negotiation scenario: explode now, hold the light back 8 beats,
  or a combined version.
- `apps/web`: React studio with a three.js stage, a Canvas2D fallback,
  procedural Web Audio driven by the audio clock, live interventions (pause,
  blackout, master light), reduced-motion support, persistence across reloads,
  and full English and Traditional Chinese interfaces.
- `services/ai`: optional FastAPI service for Live AI with Claude structured
  outputs, validation, retry with validator feedback, typed errors, and usage
  and cost reporting. The API key never reaches the browser.
- Tests: core unit tests, web unit tests, Playwright end-to-end tests on desktop
  and mobile, and Python tests for the service. CI on GitHub Actions.
- Benchmarks (`pnpm bench`, `pnpm bench:browser`) and a media capture script
  (`pnpm media`) for authentic screenshots and the demo video.
- Documentation in English and Traditional Chinese.
