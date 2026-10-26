"""Runtime configuration, read from environment variables only."""

from __future__ import annotations

import os
from dataclasses import dataclass

# USD per million tokens (input, output). Used for an approximate cost estimate only.
PRICES_PER_MTOK: dict[str, tuple[float, float]] = {
    "claude-opus-5-5": (4.0, 20.0),
    "claude-sonnet-5-5": (2.0, 10.0),
    "claude-haiku-5-5": (0.10, 0.50),
}


DEFAULT_ORIGINS = ("http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:4173")


@dataclass(frozen=True)
class Settings:
    api_key: str | None
    model: str = "claude-opus-5-5"
    effort: str = "low"
    timeout_s: float = 60.0
    max_attempts: int = 2
    base_url: str | None = None
    server_fallbacks: bool = True
    allowed_origins: tuple[str, ...] = DEFAULT_ORIGINS

    @property
    def live_available(self) -> bool:
        return bool(self.api_key)


def load_settings() -> Settings:
    origins = os.environ.get("UNPERFORMED_ALLOWED_ORIGINS")
    return Settings(
        api_key=os.environ.get("ANTHROPIC_API_KEY") or None,
        model=os.environ.get("UNPERFORMED_MODEL", "claude-opus-5-5"),
        effort=os.environ.get("UNPERFORMED_EFFORT", "low"),
        timeout_s=float(os.environ.get("UNPERFORMED_TIMEOUT_S", "60")),
        max_attempts=max(1, int(os.environ.get("UNPERFORMED_MAX_ATTEMPTS", "2"))),
        base_url=os.environ.get("UNPERFORMED_ANTHROPIC_BASE_URL") or None,
        server_fallbacks=os.environ.get("UNPERFORMED_SERVER_FALLBACKS", "1") != "0",
        allowed_origins=tuple(o.strip() for o in origins.split(",")) if origins else DEFAULT_ORIGINS,
    )


def estimate_cost(model: str, input_tokens: int, output_tokens: int) -> float | None:
    price = PRICES_PER_MTOK.get(model)
    if price is None:
        return None
    return round(input_tokens / 1e6 * price[0] + output_tokens / 1e6 * price[1], 6)
