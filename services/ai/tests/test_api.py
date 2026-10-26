"""HTTP API behaviour, including failure modes the browser relies on."""

from __future__ import annotations

from typing import Any

from fakes import Recorder, message
from fastapi.testclient import TestClient

from unperformed_ai.app import create_app
from unperformed_ai.config import Settings
from unperformed_ai.director import AnthropicDirector


def test_health_without_key_reports_live_unavailable_and_never_leaks_secrets() -> None:
    client = TestClient(create_app(Settings(api_key=None)))
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["liveAvailable"] is False
    assert "key" not in str(body).lower()


def test_health_with_key_does_not_echo_it() -> None:
    client = TestClient(create_app(Settings(api_key="fake-test-key-7f3a")))
    assert "fake-test-key-7f3a" not in client.get("/api/health").text


def test_interpret_without_key_is_503_not_a_fake_answer() -> None:
    client = TestClient(create_app(Settings(api_key=None)))
    r = client.post("/api/interpret", json={"intent": "hello"})
    assert r.status_code == 503
    assert r.json()["detail"]["code"] == "not_configured"


def test_interpret_round_trip(valid_interpretation: dict[str, Any]) -> None:
    rec = Recorder([lambda body: message(valid_interpretation)])
    app = create_app(Settings(api_key="k"), director_factory=lambda s: AnthropicDirector(s, client=rec.client()))
    r = TestClient(app).post("/api/interpret", json={"intent": "order to chaos", "locale": "en"})
    assert r.status_code == 200
    body = r.json()
    assert body["interpretation"]["title"] == valid_interpretation["title"]
    assert body["interpretation"]["phases"] == valid_interpretation["phases"]
    assert body["interpretation"]["climax"] == valid_interpretation["climax"]
    assert body["meta"]["provider"] == "anthropic"
    assert body["meta"]["latencyMs"] >= 0


def test_invalid_model_output_maps_to_502() -> None:
    rec = Recorder([lambda body: message({"nope": True})])
    app = create_app(Settings(api_key="k"), director_factory=lambda s: AnthropicDirector(s, client=rec.client()))
    r = TestClient(app).post("/api/interpret", json={"intent": "x"})
    assert r.status_code == 502
    assert r.json()["detail"]["code"] == "invalid_model_output"


def test_request_validation() -> None:
    client = TestClient(create_app(Settings(api_key="k")))
    assert client.post("/api/interpret", json={"intent": ""}).status_code == 422
    assert client.post("/api/interpret", json={"intent": "x", "locale": "fr"}).status_code == 422


def test_combine_round_trip() -> None:
    rec = Recorder([lambda body: message({"holdBeats": 4, "rationale": "Four beats, then everything."})])
    app = create_app(Settings(api_key="k"), director_factory=lambda s: AnthropicDirector(s, client=rec.client()))
    r = TestClient(app).post(
        "/api/combine",
        json={"request": "explode", "humanPlan": "immediate", "aiProposal": "held 8", "climaxLengthBeats": 28},
    )
    assert r.status_code == 200
    assert r.json()["advice"]["holdBeats"] == 4
