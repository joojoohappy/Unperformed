"""The same fixtures are validated by zod in packages/performance-core/test/contract.test.ts."""

from __future__ import annotations

from typing import get_args

import pytest
from conftest import FIXTURES, load
from pydantic import ValidationError

from unperformed_ai.models import Interpretation, RequestAnalysis, RequestKind

VALID = sorted(p.name for p in FIXTURES.glob("interpretation.valid.*.json"))
INVALID = sorted(p.name for p in FIXTURES.glob("interpretation.invalid.*.json"))


def test_fixtures_exist() -> None:
    assert len(VALID) >= 2 and len(INVALID) >= 4


@pytest.mark.parametrize("name", VALID)
def test_valid_fixtures_pass(name: str) -> None:
    it = Interpretation.model_validate(load(name))
    # Serialising back uses the same camelCase field names the browser expects.
    assert it.model_dump(by_alias=True, exclude_none=True) == {k: v for k, v in load(name).items()}


@pytest.mark.parametrize("name", INVALID)
def test_invalid_fixtures_fail(name: str) -> None:
    with pytest.raises(ValidationError):
        Interpretation.model_validate(load(name))


def test_request_kinds_match_the_engine() -> None:
    # Written by packages/performance-core/test/contract.test.ts from REQUEST_KINDS.
    assert list(get_args(RequestKind)) == load("request-kinds.json")


@pytest.mark.parametrize("kind", ["warm-ending", "more-chaos", "faster", "slower"])
def test_new_kinds_are_accepted_without_a_counter(kind: str) -> None:
    a = RequestAnalysis.model_validate({"kind": kind, "creativeDifference": True, "rationale": "x", "counter": None})
    assert a.kind == kind
