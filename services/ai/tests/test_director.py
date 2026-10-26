"""AnthropicDirector against the real SDK with an in-memory transport."""

from __future__ import annotations

import copy
from typing import Any

import httpx2
import pytest
from fakes import Recorder, message

from unperformed_ai.config import Settings
from unperformed_ai.director import AnthropicDirector, DirectorError
from unperformed_ai.models import InterpretRequest, NegotiateRequest, SectionDigest

SETTINGS = Settings(api_key="test-key", model="claude-opus-5-5", max_attempts=2)


def director(rec: Recorder, settings: Settings = SETTINGS) -> AnthropicDirector:
    return AnthropicDirector(settings, client=rec.client())


def test_interpret_sends_structured_output_request(valid_interpretation: dict[str, Any]) -> None:
    rec = Recorder([lambda body: message(valid_interpretation)])
    r = director(rec).interpret(InterpretRequest(intent="order to chaos to silence", locale="zh-TW"))
    assert r.value.title == valid_interpretation["title"]
    body = rec.requests[0]
    assert body["model"] == "claude-opus-5-5"
    assert body["output_config"]["format"]["type"] == "json_schema"
    assert body["output_config"]["effort"] == "low"
    assert "Traditional Chinese" in body["system"]
    assert body["fallbacks"] == "default"
    assert "server-side-fallback-2026-07-01" in rec.headers[0]["anthropic-beta"]
    assert r.meta.attempts == 1
    assert r.meta.input_tokens == 900 and r.meta.output_tokens == 400
    assert r.meta.estimated_cost_usd == pytest.approx(900 / 1e6 * 4 + 400 / 1e6 * 20)


def test_server_fallbacks_can_be_disabled(valid_interpretation: dict[str, Any]) -> None:
    rec = Recorder([lambda body: message(valid_interpretation)])
    director(rec, Settings(api_key="k", server_fallbacks=False)).interpret(InterpretRequest(intent="x"))
    assert "fallbacks" not in rec.requests[0]


def test_invalid_output_is_retried_with_validator_feedback(valid_interpretation: dict[str, Any]) -> None:
    broken = copy.deepcopy(valid_interpretation)
    broken["climax"]["phaseIndex"] = 0  # points at a non-climax phase: passes JSON schema, fails cross-field rule
    rec = Recorder([lambda body: message(broken), lambda body: message(valid_interpretation)])
    r = director(rec).interpret(InterpretRequest(intent="x"))
    assert r.meta.attempts == 2
    retry_messages = rec.requests[1]["messages"]
    assert "rejected by the validator" in retry_messages[-1]["content"]
    assert r.meta.input_tokens == 1800  # both attempts are billed and reported


def test_gives_up_with_typed_error_instead_of_inventing_output() -> None:
    rec = Recorder([lambda body: message("this is not json")])
    with pytest.raises(DirectorError) as e:
        director(rec).interpret(InterpretRequest(intent="x"))
    assert e.value.code == "invalid_model_output"
    assert e.value.attempts == 2


def test_refusal_is_reported(valid_interpretation: dict[str, Any]) -> None:
    rec = Recorder([lambda body: message(valid_interpretation, stop_reason="refusal")])
    with pytest.raises(DirectorError) as e:
        director(rec).interpret(InterpretRequest(intent="x"))
    assert e.value.code == "refusal"


def test_provider_outage_is_reported() -> None:
    rec = Recorder(
        [
            lambda body: httpx2.Response(
                529, json={"type": "error", "error": {"type": "overloaded_error", "message": "Overloaded"}}
            )
        ]
    )
    with pytest.raises(DirectorError) as e:
        director(rec).interpret(InterpretRequest(intent="x"))
    assert e.value.code == "provider_error"
    assert "529" in e.value.detail


def test_analyze_includes_memory_and_constraints() -> None:
    analysis = {
        "kind": "climax-burst",
        "creativeDifference": True,
        "rationale": "Hold eight beats.",
        "counter": {"releaseMode": "held", "holdBeats": 8},
    }
    rec = Recorder([lambda body: message(analysis)])
    req = NegotiateRequest(
        request="explode at the climax",
        sections=[
            SectionDigest(
                id="s4",
                name="Collapse",
                archetype="climax",
                length_beats=28,
                energy_from=0.9,
                energy_to=0.7,
                release="staggered:4",
            )
        ],
        constraints=[],
        decided_topics=["ending"],
        strategy="contrast",
    )
    r = director(rec).analyze(req)
    assert r.value.counter is not None and r.value.counter.hold_beats == 8
    prompt = rec.requests[0]["messages"][0]["content"]
    assert "ending" in prompt and "s4 Collapse [climax]" in prompt


def test_missing_key_is_not_configured() -> None:
    with pytest.raises(DirectorError) as e:
        AnthropicDirector(Settings(api_key=None))
    assert e.value.code == "not_configured"
