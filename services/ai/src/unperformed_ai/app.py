"""FastAPI app. Run with: uvicorn unperformed_ai.app:app --port 8787"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from . import __version__
from .config import Settings, load_settings
from .director import AnthropicDirector, Director, DirectorError
from .models import (
    CombineRequest,
    CombineResponse,
    Health,
    InterpretRequest,
    InterpretResponse,
    NegotiateRequest,
    NegotiateResponse,
)

STATUS = {"not_configured": 503, "timeout": 504, "invalid_model_output": 502, "provider_error": 502, "refusal": 422}


def create_app(
    settings: Settings | None = None, director_factory: Callable[[Settings], Director] | None = None
) -> FastAPI:
    settings = settings or load_settings()
    factory = director_factory or AnthropicDirector
    app = FastAPI(title="UNPERFORMED AI", version=__version__)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.allowed_origins),
        allow_methods=["GET", "POST"],
        allow_headers=["content-type"],
    )
    state: dict[str, Director] = {}

    def director() -> Director:
        if "d" not in state:
            if not settings.live_available and director_factory is None:
                raise HTTPException(
                    503, detail={"code": "not_configured", "detail": "ANTHROPIC_API_KEY is not set on the server"}
                )
            state["d"] = factory(settings)
        return state["d"]

    def run(fn: Callable[[], Any]) -> Any:
        try:
            return fn()
        except DirectorError as e:
            raise HTTPException(
                STATUS[e.code], detail={"code": e.code, "detail": e.detail, "attempts": e.attempts}
            ) from e

    @app.get("/api/health", response_model=Health, response_model_by_alias=True)
    def health() -> Health:
        return Health(
            status="ok",
            provider="anthropic",
            model=settings.model,
            live_available=settings.live_available or director_factory is not None,
            version=__version__,
        )

    @app.post("/api/interpret", response_model=InterpretResponse, response_model_by_alias=True)
    def interpret(req: InterpretRequest) -> InterpretResponse:
        r = run(lambda: director().interpret(req))
        return InterpretResponse(interpretation=r.value, meta=r.meta)

    @app.post("/api/negotiate", response_model=NegotiateResponse, response_model_by_alias=True)
    def negotiate(req: NegotiateRequest) -> NegotiateResponse:
        r = run(lambda: director().analyze(req))
        return NegotiateResponse(analysis=r.value, meta=r.meta)

    @app.post("/api/combine", response_model=CombineResponse, response_model_by_alias=True)
    def combine(req: CombineRequest) -> CombineResponse:
        r = run(lambda: director().combine(req))
        return CombineResponse(advice=r.value, meta=r.meta)

    return app


app = create_app()
