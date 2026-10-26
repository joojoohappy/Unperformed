"""The same fixtures are validated by zod in packages/performance-core/test/contract.test.ts."""

from __future__ import annotations

import pytest
from conftest import FIXTURES, load
from pydantic import ValidationError

from unperformed_ai.models import Interpretation

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
