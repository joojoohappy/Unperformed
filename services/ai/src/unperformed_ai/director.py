"""The Live AI co-director: Claude API calls with structured, validated output.

Every call:
  * asks for JSON matching a Pydantic model (structured outputs),
  * validates it again on receipt (including cross-field rules),
  * retries once with the validation errors if the output is unusable,
  * reports real latency, attempts and token usage,
  * raises a typed DirectorError instead of inventing a response.

The browser decides what to do on failure (it offers the rule-based fallback
and labels it as such). This module never substitutes a canned answer.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Generic, Literal, Protocol, TypeVar

import anthropic
from pydantic import BaseModel, ValidationError

from .config import Settings, estimate_cost
from .models import (
    CallMeta,
    CombinedAdvice,
    CombineRequest,
    Interpretation,
    InterpretRequest,
    NegotiateRequest,
    RequestAnalysis,
)

T = TypeVar("T", bound=BaseModel)
R = TypeVar("R", bound=BaseModel)

ErrorCode = Literal["not_configured", "invalid_model_output", "provider_error", "timeout", "refusal"]


class DirectorError(Exception):
    def __init__(self, code: ErrorCode, detail: str, attempts: int = 0) -> None:
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail
        self.attempts = attempts


@dataclass
class Result(Generic[R]):
    value: R
    meta: CallMeta


class Director(Protocol):
    name: str
    model: str

    def interpret(self, req: InterpretRequest) -> Result[Interpretation]: ...
    def analyze(self, req: NegotiateRequest) -> Result[RequestAnalysis]: ...
    def combine(self, req: CombineRequest) -> Result[CombinedAdvice]: ...


LANGUAGE = {"en": "English", "zh-TW": "Traditional Chinese (Taiwan)"}

SYSTEM = """You are the AI co-director of UNPERFORMED, a studio where a person directs an abstract,
real-time audiovisual performance (light, geometry, camera, procedural sound) on a dark stage.

Principles:
- The human owns the artistic intent. Interpret it faithfully; never replace it with your own idea.
- Work only in the vocabulary provided by the output schema. You are describing a plan for a
  deterministic engine, not writing code.
- Be specific and brief. No flattery, no emoji, no marketing language.
- Write every human-readable string in {language}.
"""

INTERPRET_TASK = """Interpret this creative idea as a performance plan.

Idea: {intent}
Mood hint from the person (may be empty): {mood}

Guidance:
- 3 to 6 phases in time order. Use archetypes to express the emotional arc; energy is 0..1.
- If the idea has a peak, mark exactly one phase with archetype "climax" and set climax.phaseIndex to it.
  Choose its release: "immediate" (all at once), "held" (hold back first) or "staggered" (ramp in).
- `understood`: up to 5 short statements of what you understood, so the person can correct you.
- `constraints`: only things the person clearly asked for (e.g. ending in silence). They will be shown as
  proposals for the person to approve; do not invent preferences.
- `strategy`: one sentence on your artistic strategy for this piece.
- Colours are #rrggbb. Avoid pure-white flashes; this stage must be safe for photosensitive viewers.
"""

ANALYZE_TASK = """The person asked for a change to the current plan.

Request: {request}

Current plan (phase id, name, archetype, length in beats, energy from -> to, release):
{sections}

Constraints (approved constraints are binding and are enforced by the engine, not by you):
{constraints}

Your strategy for this piece: {strategy}
Topics the person has already decided in this session (do not argue these again): {decided}

Classify the request into `kind`:
- climax-burst: wants the climax to explode / release all at once
- end-loud: wants a loud ending
- add-strobe: wants strobe / rapid flashing
- warmer: wants warmer colours overall
- warm-ending: wants the ending (only) to be warmer
- more-chaos: wants the breakdown to be more chaotic
- faster: wants a faster tempo
- slower: wants a slower tempo
- unknown: anything else

Set `creative_difference` to true ONLY if you hold a genuine, specific artistic reason to suggest
something different. Do not disagree to appear independent. If the topic is already decided, set it false.
If true and kind is climax-burst, give a `counter`: hold the release back ("held") or ramp it ("staggered")
for a number of beats, and explain in `rationale` (one or two sentences, addressed to the person).
For every other kind `counter` is null: the engine computes any counter-proposal itself, and uses your
`rationale` only to phrase an objection its own rules have found.
If false, `counter` is null and `rationale` briefly acknowledges the request.
"""

COMBINE_TASK = """The person asked for: {request}
Their plan: {human_plan}
Your earlier proposal: {ai_proposal}
The climax section is {length} beats long.

Propose one combined version that keeps what the person wants (the full explosion) but adds a shorter
held moment before it. Give `hold_beats` (2 to 8) and a one or two sentence `rationale` addressed to the person.
"""


def _digest_sections(req: NegotiateRequest) -> str:
    return "\n".join(
        f"- {s.id} {s.name} [{s.archetype}] {s.length_beats} beats, energy {s.energy_from:.2f} -> {s.energy_to:.2f}"
        + (f", release {s.release}" if s.release else "")
        for s in req.sections
    )


def _digest_constraints(req: NegotiateRequest) -> str:
    if not req.constraints:
        return "(none)"
    return "\n".join(f"- [{c.status}] {c.kind}: {c.text}" for c in req.constraints)


class AnthropicDirector:
    name = "anthropic"

    def __init__(self, settings: Settings, client: anthropic.Anthropic | None = None) -> None:
        if not settings.api_key and client is None:
            raise DirectorError("not_configured", "ANTHROPIC_API_KEY is not set")
        self.settings = settings
        self.model = settings.model
        self.client = client or anthropic.Anthropic(
            api_key=settings.api_key, base_url=settings.base_url, timeout=settings.timeout_s, max_retries=2
        )

    def _call(self, output: type[T], locale: str, task: str) -> Result[T]:
        system = SYSTEM.format(language=LANGUAGE.get(locale, "English"))
        messages: list[dict[str, Any]] = [{"role": "user", "content": task}]
        attempts = 0
        in_tok = out_tok = 0
        started = time.perf_counter()
        last_error = ""
        extra: dict[str, Any] = {}
        if self.settings.server_fallbacks:
            # Server-side refusal fallback: if this model declines, the API can continue on another model.
            extra = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}
        output_config: dict[str, Any] = {
            "effort": self.settings.effort,
            "format": {"type": "json_schema", "schema": anthropic.transform_schema(output)},
        }

        def retry_with(error: str) -> list[dict[str, Any]]:
            return [
                {"role": "user", "content": task},
                {
                    "role": "user",
                    "content": f"Your previous answer was rejected by the validator:\n{error}\nReturn a corrected answer.",
                },
            ]

        while attempts < self.settings.max_attempts:
            attempts += 1
            # The SDK's overloads are stricter than our dict-built params; the API validates them.
            create: Any = self.client.beta.messages.create
            try:
                response = create(
                    model=self.model,
                    max_tokens=4000,
                    system=system,
                    messages=messages,
                    output_config=output_config,
                    **extra,
                )
            except anthropic.APITimeoutError as e:
                raise DirectorError("timeout", str(e), attempts) from e
            except anthropic.APIConnectionError as e:
                raise DirectorError("provider_error", f"connection error: {e}", attempts) from e
            except anthropic.APIStatusError as e:
                raise DirectorError("provider_error", f"HTTP {e.status_code}: {e.message}", attempts) from e

            # Every attempt is billed, so every attempt is counted.
            in_tok += response.usage.input_tokens
            out_tok += response.usage.output_tokens
            if response.stop_reason == "refusal":
                raise DirectorError("refusal", "the model declined this request", attempts)
            text = "".join(getattr(b, "text", "") for b in response.content if b.type == "text")
            try:
                value = output.model_validate_json(text)
            except ValidationError as e:
                last_error = str(e)[:800]
                messages = retry_with(last_error)
                continue
            meta = CallMeta(
                provider=self.name,
                model=response.model or self.model,
                latency_ms=round((time.perf_counter() - started) * 1000),
                attempts=attempts,
                input_tokens=in_tok,
                output_tokens=out_tok,
                estimated_cost_usd=estimate_cost(self.model, in_tok, out_tok),
            )
            return Result(value=value, meta=meta)
        raise DirectorError("invalid_model_output", last_error or "no valid output", attempts)

    def interpret(self, req: InterpretRequest) -> Result[Interpretation]:
        task = INTERPRET_TASK.format(intent=req.intent, mood=req.mood or "")
        return self._call(Interpretation, req.locale, task)

    def analyze(self, req: NegotiateRequest) -> Result[RequestAnalysis]:
        task = ANALYZE_TASK.format(
            request=req.request,
            sections=_digest_sections(req),
            constraints=_digest_constraints(req),
            strategy=req.strategy or "(none)",
            decided=", ".join(req.decided_topics) or "(none)",
        )
        return self._call(RequestAnalysis, req.locale, task)

    def combine(self, req: CombineRequest) -> Result[CombinedAdvice]:
        task = COMBINE_TASK.format(
            request=req.request, human_plan=req.human_plan, ai_proposal=req.ai_proposal, length=req.climax_length_beats
        )
        return self._call(CombinedAdvice, req.locale, task)
