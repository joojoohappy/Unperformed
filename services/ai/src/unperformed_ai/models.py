"""Pydantic contracts for model output and the HTTP API.

These mirror the zod schemas in packages/performance-core. The browser
validates every response again, so a mismatch fails loudly on both sides.
A shared fixture test (tests/test_contract.py) keeps the two in step.
"""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator
from pydantic.alias_generators import to_camel

Mood = Literal["serene", "tense", "melancholic", "euphoric", "ominous", "tender", "defiant"]
Archetype = Literal["order", "build", "fracture", "climax", "release", "silence", "drift"]
GeometryForm = Literal["grid", "lattice", "shards", "ring", "dust", "void", "monolith"]
SoundTexture = Literal["drone", "pulse", "noise", "swell", "silence"]
ReleaseMode = Literal["immediate", "held", "staggered"]
ConstraintKind = Literal["ending-silence", "opening-order", "no-strobe", "max-energy", "keep-climax"]
RequestKind = Literal[
    "climax-burst", "end-loud", "add-strobe", "warmer", "warm-ending", "more-chaos", "faster", "slower", "unknown"
]
Locale = Literal["en", "zh-TW"]
PropKind = Literal["pillars", "monolith", "ring", "beam", "strings", "lasers", "screens", "words", "shards", "haze"]
Floor = Literal["mirror", "matte", "water"]

Unit = Annotated[float, Field(ge=0, le=1)]
Hex = Annotated[str, Field(pattern=r"^#[0-9a-fA-F]{6}$")]


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")


class Palette(Camel):
    base: Hex
    accent: Hex
    climax: Hex


class InterpretedPhase(Camel):
    name: Annotated[str, Field(min_length=1, max_length=48)]
    archetype: Archetype
    weight: Annotated[int, Field(ge=1, le=5)]
    energy_from: Unit
    energy_to: Unit
    geometry: GeometryForm
    sound: SoundTexture
    note: Annotated[str, Field(max_length=160)]


class ClimaxSpec(Camel):
    phase_index: Annotated[int, Field(ge=0, le=5)]
    release: ReleaseMode
    hold_beats: Annotated[int, Field(ge=0, le=16)]


class ConstraintSpec(Camel):
    kind: ConstraintKind
    text: Annotated[str, Field(min_length=1, max_length=160)]
    value: Unit | None = None


class SetPiece(Camel):
    kind: PropKind
    amount: Unit


class StageSet(Camel):
    pieces: Annotated[list[SetPiece], Field(min_length=1, max_length=10)]
    floor: Floor

    @model_validator(mode="after")
    def _unique(self) -> StageSet:
        kinds = [p.kind for p in self.pieces]
        if len(kinds) != len(set(kinds)):
            raise ValueError("each set piece kind may appear once")
        return self


class Interpretation(Camel):
    """The structured creative reading of an idea. The model's only planning output."""

    title: Annotated[str, Field(min_length=1, max_length=80)]
    summary: Annotated[str, Field(min_length=1, max_length=400)]
    understood: Annotated[list[Annotated[str, Field(min_length=1, max_length=160)]], Field(min_length=1, max_length=5)]
    mood: Mood
    palette: Palette
    set: StageSet
    tempo_bpm: Annotated[int, Field(ge=60, le=160)]
    phases: Annotated[list[InterpretedPhase], Field(min_length=3, max_length=6)]
    climax: ClimaxSpec | None
    constraints: Annotated[list[ConstraintSpec], Field(max_length=4)]
    strategy: Annotated[str, Field(min_length=1, max_length=240)]

    @model_validator(mode="after")
    def _climax_consistent(self) -> Interpretation:
        climaxes = [i for i, p in enumerate(self.phases) if p.archetype == "climax"]
        if len(climaxes) > 1:
            raise ValueError("at most one climax phase")
        if climaxes and self.climax is None:
            raise ValueError("climax details required when a climax phase exists")
        if self.climax is not None:
            if self.climax.phase_index >= len(self.phases):
                raise ValueError("climax.phaseIndex out of range")
            if self.phases[self.climax.phase_index].archetype != "climax":
                raise ValueError("climax.phaseIndex must point to a phase with archetype 'climax'")
        return self


class Counter(Camel):
    release_mode: Literal["held", "staggered"]
    hold_beats: Annotated[int, Field(ge=0, le=16)]


class RequestAnalysis(Camel):
    """The model's reading of a change request during negotiation."""

    kind: RequestKind
    creative_difference: bool
    rationale: Annotated[str, Field(max_length=280)]
    counter: Counter | None


class CombinedAdvice(Camel):
    hold_beats: Annotated[int, Field(ge=2, le=8)]
    rationale: Annotated[str, Field(min_length=1, max_length=280)]


# ---------------------------------------------------------------- HTTP API


class InterpretRequest(Camel):
    intent: Annotated[str, Field(min_length=1, max_length=1000)]
    mood: Mood | None = None
    locale: Locale = "en"


class SectionDigest(Camel):
    id: str
    name: str
    archetype: Archetype
    length_beats: int
    energy_from: Unit
    energy_to: Unit
    release: str | None = None


class ConstraintDigest(Camel):
    kind: ConstraintKind
    text: str
    status: Literal["proposed", "approved"]


class NegotiateRequest(Camel):
    locale: Locale = "en"
    request: Annotated[str, Field(min_length=1, max_length=500)]
    sections: Annotated[list[SectionDigest], Field(min_length=1, max_length=8)]
    constraints: Annotated[list[ConstraintDigest], Field(max_length=12)] = []
    decided_topics: Annotated[list[str], Field(max_length=20)] = []
    strategy: Annotated[str, Field(max_length=240)] = ""


class CombineRequest(Camel):
    locale: Locale = "en"
    request: Annotated[str, Field(min_length=1, max_length=500)]
    human_plan: Annotated[str, Field(max_length=300)]
    ai_proposal: Annotated[str, Field(max_length=300)]
    climax_length_beats: Annotated[int, Field(ge=4, le=256)]


class CallMeta(Camel):
    provider: str
    model: str
    latency_ms: int
    attempts: int
    input_tokens: int
    output_tokens: int
    estimated_cost_usd: float | None


class InterpretResponse(Camel):
    interpretation: Interpretation
    meta: CallMeta


class NegotiateResponse(Camel):
    analysis: RequestAnalysis
    meta: CallMeta


class CombineResponse(Camel):
    advice: CombinedAdvice
    meta: CallMeta


class Health(Camel):
    status: Literal["ok"]
    provider: str
    model: str
    live_available: bool
    version: str
