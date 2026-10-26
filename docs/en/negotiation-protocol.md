# Negotiation protocol

[繁體中文](../zh-TW/negotiation-protocol.md)

The negotiation is where the person and the director disagree productively.
The rules are short:

1. The director objects **only when there is a genuine creative reason**, says
   it once, and says why.
2. **Nothing changes until the person chooses.** Every option shows the exact
   field changes it would make.
3. **Approved constraints are never silently broken.** A conflict is shown as
   a conflict, with a way to keep the constraint and a separate, explicit way
   to lift it.
4. **Safety limits are not negotiable** and are not framed as taste.
5. **The director does not repeat an objection** the person already decided.

## A round

`openRound({ id, score, request, memory, advice })` in
`packages/performance-core/src/negotiation.ts` returns a `NegotiationRound`.
The checks run in this order, and the first that applies decides the kind:

| Order | Kind | When | Options |
| --- | --- | --- | --- |
| 1 | `not-understood` | The request matches no known change. | None. The round closes; the person can rephrase. |
| 2 | `safety` | A strobe or flashing request. | A safe pulse (≤ 2 Hz), or keep the score. |
| 3 | `constraint-conflict` | The person's plan would break an approved constraint. | Keep the constraint; a director alternative that respects it (for example, move the loud hit to the penultimate section); or lift the constraint and apply the plan (`unlocksConstraint`). |
| 4 | `deferral` | The director already objected on this topic and the person decided. | Apply the person's plan, without a second objection. |
| 5 | `proposal` | A rule finds a genuine creative difference (see [Scenarios with rules](#scenarios-with-rules)). | The person's plan, the director's proposal, and, where the scenario has one, a combined version on request. |
| 6 | `agreement` | Anything else. | Apply the person's plan. |

Each option carries `changes` (a field-level diff computed by actually running
`applyPatch` on a copy), `allowed`, and `blockedBy` when a constraint would stop
it.

## The core scenario

The demo idea is "perfect order, gradual collapse, complete silence". The
person asks: *"I want everything to explode at the climax."*

- **Person's plan:** release everything on the first beat of the climax at full
  energy, density and light.
- **The director's view:** the build already reaches 85% energy going in, so an
  instant explosion reads as more of the same. It proposes **holding the light
  and sound back for 8 beats, then releasing everything**: the silence makes the
  release land.
- **Combined version** (on request): a shorter 4-beat breath, then the full
  explosion exactly as asked.

The person chooses. The chosen patch is applied with `humanApproved: true`, so
its fields join `humanLocked`. If the person asks again later, the round is a
`deferral`: the director notes the earlier decision and applies the request
without arguing.

## Scenarios with rules

Each scenario has one deterministic rule in `negotiation.ts`
(`ruleBasedClimaxAdvice` for the climax, `ruleProposal` for the rest). The
rule decides whether an objection exists and computes the counter-proposal.
When the rule finds nothing, the round is an `agreement`. Every row is pinned
by tests in `packages/performance-core/test/negotiation.test.ts`: objection,
no objection, deferral on repeat, and the constraint case.

| Request (kind, topic) | The director objects when | Director's proposal | Combined | Under an approved constraint |
| --- | --- | --- | --- | --- |
| "Explode at the climax" (`climax-burst`, `climax-release`) | The section before the climax ends at ≥ 60% energy. | Hold the release 8 beats (a model may tune it, clamped to 2..16 and the section length). | A shorter hold (model or half). | Ordinary conflict handling. |
| "Make the ending warmer" (`warm-ending`, `ending-light`) | The last section is a `silence` at light ≤ 0.1. Showing warmth needs 35% light, and then it is no longer a silence. | A warm afterglow: warm wash and key at 8% light, inside the silence threshold. | A dim warm glow halfway between (about 22%). | `ending-silence` blocks the plan; the afterglow is offered as the alternative that respects it. |
| "More chaos in the fracture" (`more-chaos`, `fracture`) | A climax follows, and the plan (order −0.25) would leave the fracture's order below the climax's order + 0.15. The collapse would peak before the climax. | The same extra density, tremor and energy, with order held at climax order + 0.15. | Order halfway between. | `max-energy` can block the +0.1 energy; the alternative is the same disorder without more energy. |
| "Make it faster" (`faster`, `tempo`) | The last section is a resting one (`silence`, `release` or `drift`) that lasts ≥ 12 s now and would last < 12 s at the new tempo (× 1.25, at most 160 BPM). | The fastest tempo that keeps the ending at 12 s or more. | None: there is no honest middle ground between the two tempos. | No constraint kind covers tempo, so a tempo change never conflicts. A test pins that. |
| "Slow it down" (`slower`, `tempo`) | Never. Slowing down (× 0.8, at least 60 BPM) cannot shorten the ending, and the director does not invent an objection. | | | As above. |

On the demo score (120 BPM, a 28-beat silent ending, fracture order 0.3,
climax order 0.05) these give: an afterglow at 8% instead of 35% light; order
0.2 instead of 0.05; 140 BPM (a 12.0 s ending) instead of 150 BPM (11.2 s).

`warmer` (the whole palette), `end-loud` and `add-strobe` have no
creative-difference rule: they are agreements, constraint conflicts, or a
safety notice.

Tempo changes use the `setTempo` patch operation. It is `shared` in the
[authority policy](authority-policy.md), so the director can never change
the tempo on its own.

## Memory

`CreativeMemory` holds one entry per decided round: topic, whether the director
objected, and what the person chose. It lives in the session and is shown in
the review. It is used only for the deferral rule above.

## Live AI

With Live AI, the service classifies the request and may write the rationale
and propose a hold. The rule still decides whether an objection exists, and the
hold is clamped (see [authority policy](authority-policy.md)). For the other
scenarios the model only phrases the objection: its `rationale` replaces the
rule's message when it also reports a creative difference, but any numbers it
sends are ignored, and the combined version comes from the rules without a
model call. If the call
fails, the round is built by the rules and labelled
"rule-based fallback: Live AI failed (code)". The source of every message is
shown next to it: `demo rules (no AI model)`, `rule-based fallback`, or the
model id.
