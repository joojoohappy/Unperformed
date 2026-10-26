# Authority policy

[繁體中文](../zh-TW/authority-policy.md)

Who may change what is decided by deterministic code in
`packages/performance-core/src/patch.ts`, not by a prompt. A model can be
asked to respect boundaries, but only code can guarantee it. The tests in
`packages/performance-core/test/authority.test.ts` pin every rule below.

## Three levels

Every patch operation is classified against the current score by
`authorityOf(op, score)`:

| Level | Meaning | Examples |
| --- | --- | --- |
| `ai` | Routine staging the director may decide on its own and report. | Camera moves; small energy nudges (≤ 0.15); small lighting changes outside the climax; geometry density or order outside the climax; transitions outside the climax. |
| `shared` | A meaningful creative change. Needs an explicit human choice. | Anything in the climax section; release mode and hold; palette; tempo; geometry form; sound texture; energy changes over 0.15 or a new curve; key or accent light; raising flicker by more than 0.1. |
| `human` | Intent-level decisions only a person can make. | Adding, removing, approving or rejecting a constraint. |

## How `applyPatch` enforces it

`applyPatch(score, patch, { actor, humanApproved })` either applies every
operation or none:

1. The patch must parse (typed operations, value ranges).
2. If the actor is the AI:
   - any `human`-level operation is rejected (`human-only`);
   - any `shared`-level operation is rejected unless a person approved this
     exact patch (`needs-approval`), for example by choosing it in a
     negotiation;
   - any field in `humanLocked` is rejected unless approved (`human-locked`).
3. The operations are applied to a copy.
4. The result must be a valid score.
5. The result must satisfy **every approved constraint, whoever the actor
   is**. A person who wants to break a constraint has to remove it in the same
   patch, which the negotiation offers as a separate, clearly labelled option.
6. Fields changed by a person, or by an AI patch a person approved, are added
   to `humanLocked`, so the director cannot quietly undo them later.

A rejected patch returns the original score and typed reasons. Nothing is
partially applied.

## Constraints

Constraints are compiled as `proposed`. Until a person approves one it is a
suggestion and is not enforced. Approved constraints are precise predicates
(`constraints.ts`):

| Kind | Holds when |
| --- | --- |
| `ending-silence` | The last section has the `silence` texture, ends at energy ≤ 0.05 and light ≤ 0.1. |
| `opening-order` | The first section has geometry order ≥ 0.9 and no tremor camera. |
| `no-strobe` | No section has flicker above 0.15. |
| `max-energy` | No section's energy exceeds the given cap. |
| `keep-climax` | The score still has a climax section. |

## Safety is not a creative opinion

Light flicker is capped at 2 Hz in the timeline (`MAX_FLICKER_HZ`) and dims
by at most 30%, whatever the score says. A strobe request is answered with a
safety notice and a safe pulse option. The negotiation never presents this as
a matter of taste. `safety.ts` checks the sampled timeline against the WCAG
2.3.1 general-flash threshold (no more than three flashes in any one second);
the benchmark runs it on the demo score and on a worst case with maximum
flicker in every section.

## Where the model fits

A model's output never reaches `applyPatch` directly. Live AI returns an
`Interpretation` (compiled by the same compiler as demo rules) or advice for a
negotiation round. In a round, the model may phrase the rationale and suggest a
hold length, but:

- whether the director objects at all is decided by the rule in
  `ruleBasedClimaxAdvice` (is the stage already at 60% energy or more going
  into the climax?), so the model cannot disagree just to appear autonomous;
- the suggested hold is clamped to 2–16 beats and to the section length;
- the resulting option is still a patch a person must choose.
