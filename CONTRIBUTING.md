# Contributing to UNPERFORMED

English · [繁體中文](CONTRIBUTING.zh-TW.md)

Thank you for helping. This project is small and opinionated; these notes keep
it that way.

## Set up

```bash
pnpm install                 # Node 20+ (22 recommended), pnpm 10
pnpm dev                     # studio on http://localhost:5173, demo mode
cd services/ai && uv sync    # only if you work on Live AI (Python 3.11+)
```

## Before you open a pull request

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e                # Playwright; installs nothing, uses your Chromium
pnpm test:ai                 # if you touched services/ai
```

CI runs the same commands. Please keep them green.

## Principles

These are the project's non-negotiables. A change that weakens one needs a
design discussion first (open an issue).

1. **Honest engineering.** Never present rules as AI. Every message shows its
   source. Never fabricate measurements, recordings or model output; if
   something was not measured, say so.
2. **Authority in code.** Every change to a score is a typed patch through
   `applyPatch`. New kinds of edits need an authority rule and a test in
   `packages/performance-core/test/authority.test.ts`.
3. **Scores are data.** No executable content in the schema.
4. **Safety in the engine.** Flicker caps and reduced motion are not settings a
   score can override.
5. **Two languages.** Every user-facing string goes in both
   `apps/web/src/i18n/en.ts` and `zh-TW.ts`; the i18n test checks parity. Docs
   live in `docs/en` and `docs/zh-TW`; update both, or open an issue for the
   translation.
6. **Deterministic core.** `packages/performance-core` has no DOM, network or
   clock. Keep it that way.

## Where things live

| Change | Where | Tests |
| --- | --- | --- |
| Score fields, rules | `packages/performance-core/src/schema.ts` | `test/schema.test.ts`, then `pnpm --filter @unperformed/performance-core schema` |
| Authority | `src/patch.ts` | `test/authority.test.ts` |
| Negotiation | `src/negotiation.ts` | `test/negotiation.test.ts` |
| Timeline, safety | `src/timeline.ts`, `src/safety.ts` | `test/timeline.test.ts` |
| Interface | `apps/web/src/views`, `components` | `apps/web/e2e` |
| Live AI | `services/ai/src/unperformed_ai` | `services/ai/tests` |

If you change the Interpretation contract, update both the zod schema and the
Pydantic models; the shared fixtures in `packages/performance-core/fixtures`
are checked by both test suites.

## Media

Screenshots and the demo video are regenerated with `pnpm media`. Never
replace them with edited or generated images. See `docs/en/media.md`.

## Commits and pull requests

Small, focused pull requests are easiest to review. Describe what changed and
how you verified it. By contributing you agree that your contribution is
licensed under the Apache License 2.0.
