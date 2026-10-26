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
| 5 | `proposal` | A climax request when the stage is already at ≥ 60% energy going in. | The person's plan, the director's proposal, and on request a combined version. |
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

## Memory

`CreativeMemory` holds one entry per decided round: topic, whether the director
objected, and what the person chose. It lives in the session and is shown in
the review. It is used only for the deferral rule above.

## Live AI

With Live AI, the service classifies the request and may write the rationale
and propose a hold. The rule still decides whether an objection exists, and the
hold is clamped (see [authority policy](authority-policy.md)). If the call
fails, the round is built by the rules and labelled
"rule-based fallback: Live AI failed (code)". The source of every message is
shown next to it: `demo rules (no AI model)`, `rule-based fallback`, or the
model id.
