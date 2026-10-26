# The Performance Score

[繁體中文](../zh-TW/performance-score.md)

The Performance Score is the single contract between the creative workflow and
the real-time engine. It is defined with zod in
[`packages/performance-core/src/schema.ts`](../../packages/performance-core/src/schema.ts)
and exported as JSON Schema in
[`docs/schema/performance-score.schema.json`](../schema/performance-score.schema.json)
(regenerate with `pnpm --filter @unperformed/performance-core schema`).

Nothing in a score is executable. Every field is an enum or a bounded number,
so a model can propose a score change but can never inject behaviour into the
renderer or the audio engine.

## Two contracts, on purpose

| | Interpretation | Performance Score |
| --- | --- | --- |
| Written by | A planner: demo rules or a model | The deterministic compiler, then patches |
| Content | Creative intent: phases, moods, a climax, proposed constraints, a strategy | Everything the stage needs: timing, energy, light, camera, geometry, sound |
| Size | Small (3–6 phases, short strings) | Complete |
| Validation | `.strict()`, unknown fields rejected | Field ranges plus cross-field rules |

A model is good at the left column and unreliable at the right one (beat
arithmetic, consistent ranges). Keeping the model's output small and creative,
and compiling it with code, makes Live AI and demo mode produce scores with the
same guarantees.

## Score

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `1` | Bumped on breaking changes. |
| `title`, `summary` | string | ≤ 80 and ≤ 400 characters. |
| `mood` | enum | `serene`, `tense`, `melancholic`, `euphoric`, `ominous`, `tender`, `defiant`. |
| `tempoBpm` | int 60–160 | One beat is the unit of time everywhere. |
| `rootNote` | MIDI 36–60 | Procedural audio is tuned around it. |
| `seed` | int | Makes layout and noise reproducible. Derived from the idea text. |
| `totalBeats` | int 16–512 | Equals the sum of section lengths. |
| `palette` | `{ base, accent, climax }` | `#rrggbb`. |
| `sections` | 2–8 `Section` | Contiguous, in order. |
| `constraints` | ≤ 12 `Constraint` | See below. |
| `humanLocked` | string[] | Field paths a person set, e.g. `s3.camera.move`. The AI may not change them. |

## Section

| Field | Type | Notes |
| --- | --- | --- |
| `id` | `s<n>` | Unique. |
| `name` | string | Spelled by the stage elements, and shown in the caption, HUD and timeline. |
| `note` | string, optional | Up to 160 characters: what happens in this section, from the interpretation. Shown as the stage caption. |
| `archetype` | enum | `order`, `build`, `fracture`, `climax`, `release`, `silence`, `drift`. |
| `startBeat`, `lengthBeats` | int | `startBeat` must equal the previous section's end. Length 4–256. |
| `energy` | `{ from, to, curve }` | 0–1. Curve: `linear`, `ease-in`, `ease-out`, `step`. |
| `lighting` | `{ key, accent, intensity, wash, flicker }` | Wash: `cold`, `neutral`, `warm`. Flicker 0–1 is an amount; its frequency is capped at 2 Hz by the engine. |
| `camera` | `{ move, speed }` | `static`, `push-in`, `pull-back`, `orbit`, `drift`, `tremor`. |
| `geometry` | `{ form, order, density }` | Form: `grid`, `lattice`, `shards`, `ring`, `dust`, `void`, `monolith`. Order 1 is perfect alignment. |
| `sound` | `{ texture, level, pulseEvery, pitch }` | Texture: `drone`, `pulse`, `noise`, `swell`, `silence`. Pitch in semitones, ±12. |
| `transition` | `{ type, beats }` | Into this section: `cut`, `fade`, `dissolve`, `blackout`; 0–8 beats. |
| `release` | `{ mode, holdBeats }`, optional | Only on a `climax` section. `immediate`, `held` (wait, then release) or `staggered`. `holdBeats` must be shorter than the section. |

## Constraint

| Field | Notes |
| --- | --- |
| `id`, `kind`, `text` | Kind: `ending-silence`, `opening-order`, `no-strobe`, `max-energy`, `keep-climax`. `text` is in the language the person wrote in. |
| `value` | Optional 0–1 parameter (the cap for `max-energy`). |
| `status` | `proposed` until a person approves it; only `approved` constraints are enforced. |
| `owner` | Always `human`. |

## Cross-field rules

Checked in `superRefine` and covered by `test/schema.test.ts`:

- sections are contiguous from beat 0 and sum to `totalBeats`;
- section ids are unique;
- `release` appears only on a climax section, and the hold is shorter than the
  section;
- constraint ids are unique.

## Interpretation

The planner's output (`interpretation.ts`): `title`, `summary`, `mood`,
`understood` (1–5 lines saying what was understood), `tempoBpm`, 3–6 `phases`
(name, archetype, weight 1–5, `energyFrom` and `energyTo`, geometry form, sound texture, note), a nullable
`climax` (`phaseIndex`, `release`, `holdBeats`), proposed `constraints`, and a
one-line `strategy`. Valid and invalid fixtures shared by the TypeScript and
Python tests live in `packages/performance-core/fixtures/`.
