from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest

FIXTURES = Path(__file__).resolve().parents[3] / "packages" / "performance-core" / "fixtures"


def load(name: str) -> Any:
    return json.loads((FIXTURES / name).read_text(encoding="utf-8"))


@pytest.fixture
def valid_interpretation() -> dict[str, Any]:
    return load("interpretation.valid.en.json")  # type: ignore[no-any-return]
