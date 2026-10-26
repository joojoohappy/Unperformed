"""Opt-in integration test against the real Claude API.

Skipped unless both ANTHROPIC_API_KEY and UNPERFORMED_LIVE_TESTS=1 are set, so
`pnpm test:ai` and CI never make a billed call by accident:

    UNPERFORMED_LIVE_TESTS=1 ANTHROPIC_API_KEY=... uv run pytest tests/test_live.py -s

It checks that a real model's answers pass the same validators the browser
uses, and prints the real usage of each call. It does not judge creative quality.
"""

from __future__ import annotations

import os

import pytest

from unperformed_ai.config import load_settings
from unperformed_ai.director import AnthropicDirector, Result
from unperformed_ai.models import (
    CombineRequest,
    Interpretation,
    InterpretRequest,
    Locale,
    NegotiateRequest,
    SectionDigest,
)

pytestmark = pytest.mark.skipif(
    not (os.environ.get("ANTHROPIC_API_KEY") and os.environ.get("UNPERFORMED_LIVE_TESTS") == "1"),
    reason="live API test: set ANTHROPIC_API_KEY and UNPERFORMED_LIVE_TESTS=1",
)

IDEAS: dict[Locale, str] = {
    "en": "I want a performance that starts with perfect order, gradually collapses into chaos, and ends in complete silence.",
    "zh-TW": "我想要一場從完美秩序開始、逐漸崩解成混亂、最後歸於完全寂靜的演出。",
}
EXPLODE: dict[Locale, str] = {
    "en": "I want everything to explode at the climax.",
    "zh-TW": "我希望高潮時一切都爆炸開來。",
}


def report(label: str, r: Result[object]) -> None:
    m = r.meta
    print(
        f"\n[live] {label}: model={m.model} latency={m.latency_ms}ms attempts={m.attempts} "
        f"tokens={m.input_tokens}/{m.output_tokens} cost≈${m.estimated_cost_usd}"
    )


def digest(i: Interpretation) -> list[SectionDigest]:
    out = []
    for n, p in enumerate(i.phases):
        release = i.climax.release if i.climax and i.climax.phase_index == n else None
        out.append(
            SectionDigest(
                id=f"s{n}",
                name=p.name,
                archetype=p.archetype,
                length_beats=p.weight * 8,
                energy_from=p.energy_from,
                energy_to=p.energy_to,
                release=release,
            )
        )
    return out


@pytest.mark.parametrize("locale", ["en", "zh-TW"])
def test_full_workflow_against_real_api(locale: Locale) -> None:
    director = AnthropicDirector(load_settings())

    interp = director.interpret(InterpretRequest(intent=IDEAS[locale], locale=locale))
    report(f"{locale} interpret", interp)
    i = interp.value
    assert i.phases[0].archetype in ("order", "build", "drift")
    assert any(c.kind == "ending-silence" for c in i.constraints) or i.phases[-1].archetype == "silence"

    analysis = director.analyze(
        NegotiateRequest(locale=locale, request=EXPLODE[locale], sections=digest(i), strategy=i.strategy)
    )
    report(f"{locale} analyze", analysis)
    assert analysis.value.kind == "climax-burst"

    climax = next((s for s in digest(i) if s.archetype == "climax"), None)
    combined = director.combine(
        CombineRequest(
            locale=locale,
            request=EXPLODE[locale],
            human_plan="release immediately on the first beat of the climax",
            ai_proposal="hold the release back for 4 beats",
            climax_length_beats=climax.length_beats if climax else 16,
        )
    )
    report(f"{locale} combine", combined)
    assert 2 <= combined.value.hold_beats <= 8
