# Design decisions

[繁體中文](../zh-TW/design-decisions.md)

Short records of the decisions that shape UNPERFORMED. Each says what was
decided, why, and what it costs.

## ADR-001: The model writes an Interpretation; code writes the Score

**Decision.** A planner (demo rules or a model) produces a small, creative
`Interpretation`. A deterministic compiler turns it into a full
`PerformanceScore`.

**Why.** Models are good at intent and language and unreliable at beat
arithmetic and consistent numeric ranges. A compiler guarantees contiguous
sections, valid ranges and safety caps, and gives demo mode and Live AI the
same guarantees.

**Cost.** The model cannot express things the compiler does not know. New
expressive range means extending the schema and compiler, not the prompt.

## ADR-002: Authority is enforced in code, not in a prompt

**Decision.** Every change to a score is a typed patch. `applyPatch` classifies
each operation (`ai`, `shared`, `human`) and rejects what the actor may not do.
Approved constraints bind every actor, including the person, until they lift
the constraint explicitly.

**Why.** A prompt can ask a model to respect boundaries but cannot guarantee
it. Tests can.

**Cost.** Every new kind of edit needs an authority rule and a test.

## ADR-003: Disagreement is grounded in a rule

**Decision.** In the climax scenario the director objects only when the stage
is already at 60% energy or more going into the climax. A model may phrase the
objection and tune the hold, but cannot create an objection the rule does not
support.

**Why.** An AI collaborator that disagrees to look autonomous wastes the
person's time. A testable reason (there is nothing to contrast the explosion
against) keeps objections honest.

**Cost.** Objections are limited to the scenarios that have rules. The protocol
is general; only the climax scenario has a full rule today.

## ADR-004: The audio clock is the master clock

**Decision.** Visuals ask the transport for the current beat on every frame.
While sound plays, the beat comes from `AudioContext.currentTime`.

**Why.** Audio cannot drop frames without being heard; visuals can. Driving
visuals from the audio clock keeps them in sync even when rendering is slow.

**Cost.** When sound is off or blocked, a `performance.now()` clock is used, and
audio and visuals are no longer locked (there is no audio).

## ADR-005: The timeline is a pure function

**Decision.** `sample(score, beat, options)` returns everything the stage needs
for that instant, with no state.

**Why.** Scrubbing, rehearsal, reduced motion, interventions, frame-stepped
video capture, the flash check and the tests all use the same function. Replays
are identical by construction (`timelineFingerprint`).

**Cost.** Effects that need history (trails, physics) must be derived from the
beat or added as renderer-only polish.

## ADR-006: Procedural everything

**Decision.** Geometry, light and sound are generated at run time. No samples,
textures or third-party media.

**Why.** No asset licensing questions, a small bundle, and a score fully
determines what is seen and heard.

**Cost.** A narrower aesthetic than a sample library would allow.

## ADR-007: Demo mode is first class and clearly labelled

**Decision.** The whole workflow runs without credentials, using deterministic
rules. Every message shows its source: `demo rules (no AI model)`,
`rule-based fallback`, or the model id.

**Why.** Anyone can try the project, CI can test it end to end, and nobody is
misled into thinking rules are a model.

**Cost.** The demo planner understands a limited vocabulary (documented in
[limitations](limitations.md)).

## ADR-008: The API key stays on a server

**Decision.** Live AI goes through `services/ai`. The browser calls `/api/*`
(proxied by Vite in development) and never sees the key.

**Why.** Any key in a client bundle is public.

**Cost.** Live AI needs a running service. A static deployment (for example
GitHub Pages) can only offer demo mode.

## ADR-009: A 2D fallback renderer and a form fallback chain

**Decision.** If WebGL is unavailable, a Canvas2D renderer draws the same
layout. Forms it cannot draw are substituted through a fixed chain
(`lattice → grid`, and so on).

**Why.** The performance should run on low-end and locked-down devices instead
of failing.

**Cost.** The 2D stage is flatter and has no lighting model.

## ADR-010: Safety caps live in the engine

**Decision.** Light modulation is capped at 2 Hz and 30% depth in the timeline,
whatever a score says. Reduced motion is honoured from the OS setting and a
toggle.

**Why.** Photosensitive safety must not depend on a model or a person getting a
number right.

**Cost.** The stage cannot strobe, by design.
