"""Helpers for tests: a canned Messages API served through an in-memory transport.

These exercise the real anthropic SDK request/parse path without network access
or credentials. They are test doubles, not a demo mode.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any

import anthropic
import httpx2

Responder = Callable[[dict[str, Any]], dict[str, Any] | httpx2.Response]


def message(
    payload: Any, *, stop_reason: str = "end_turn", input_tokens: int = 900, output_tokens: int = 400
) -> dict[str, Any]:
    text = payload if isinstance(payload, str) else json.dumps(payload)
    return {
        "id": "msg_test",
        "type": "message",
        "role": "assistant",
        "model": "claude-opus-5-5",
        "content": [{"type": "text", "text": text}],
        "stop_reason": stop_reason,
        "stop_sequence": None,
        "usage": {"input_tokens": input_tokens, "output_tokens": output_tokens},
    }


class Recorder:
    def __init__(self, responders: list[Responder]) -> None:
        self.responders = responders
        self.requests: list[dict[str, Any]] = []
        self.headers: list[dict[str, str]] = []

    def handler(self, request: httpx2.Request) -> httpx2.Response:
        body = json.loads(request.content)
        self.requests.append(body)
        self.headers.append(dict(request.headers))
        responder = self.responders[min(len(self.requests) - 1, len(self.responders) - 1)]
        out = responder(body)
        return out if isinstance(out, httpx2.Response) else httpx2.Response(200, json=out)

    def client(self) -> anthropic.Anthropic:
        return anthropic.Anthropic(
            api_key="test-key",
            base_url="https://api.anthropic.test",
            http_client=httpx2.Client(transport=httpx2.MockTransport(self.handler)),
            max_retries=0,
        )
