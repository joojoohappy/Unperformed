# Changelog

All notable changes are recorded here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

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
