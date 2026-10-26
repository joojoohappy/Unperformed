# UNPERFORMED Live AI service

An optional FastAPI service that lets the UNPERFORMED studio use a Claude model
as its co-director. The studio works fully without it (demo mode).

The service holds the API key. The browser only ever talks to this service
(through the Vite proxy in development), so the key never reaches the client
bundle.

## What it does

| Endpoint | Purpose |
| --- | --- |
| `GET /api/health` | Reports whether Live AI is available (a key is configured) and which model is set. Never returns the key. |
| `POST /api/interpret` | Turns a creative idea into an `Interpretation` (3 to 6 phases, climax, constraints). |
| `POST /api/negotiate` | Classifies a change request and gives the director's opinion on it. |
| `POST /api/combine` | Writes a short rationale for a combined option. |

Every model call:

- asks for structured output against a JSON Schema generated from the Pydantic
  models (`output_config.format`), then validates the reply again with Pydantic
  (`extra="forbid"`);
- retries once (configurable) when the reply does not validate, feeding the
  validation error back to the model;
- reports real latency, the number of attempts, input and output tokens summed
  over all attempts, and an approximate cost;
- fails with a typed error instead of inventing a result:

| Code | HTTP | Meaning |
| --- | --- | --- |
| `not_configured` | 503 | No `ANTHROPIC_API_KEY` is set. |
| `timeout` | 504 | The provider did not answer in time. |
| `provider_error` | 502 | Connection or API error. |
| `invalid_model_output` | 502 | The model's output never validated. |
| `refusal` | 422 | The model declined the request. |

The studio shows these errors. For negotiation it falls back to its rules and
labels the result "rule-based fallback"; for interpretation it asks the person
whether to continue with demo rules. It never presents a rule-based answer as
model output.

The model only ever proposes. The deterministic core in
`packages/performance-core` compiles, validates and applies everything, and
enforces the authority policy (see `docs/en/authority-policy.md`).

## Run

```bash
cd services/ai
uv sync
export ANTHROPIC_API_KEY=...        # never commit this
uv run uvicorn unperformed_ai.app:app --port 8787
```

or from the repository root: `pnpm dev:ai`. Then start the studio with
`pnpm dev` and switch the top bar to **Live AI**.

## Configuration

All settings come from environment variables (see `.env.example` at the root).

| Variable | Default | |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` | (none) | Required for Live AI. |
| `UNPERFORMED_MODEL` | `claude-opus-5-5` | Any Claude model id that supports structured outputs. |
| `UNPERFORMED_EFFORT` | `low` | `output_config.effort`. Short structured answers do not need more. |
| `UNPERFORMED_TIMEOUT_S` | `60` | Per request. |
| `UNPERFORMED_MAX_ATTEMPTS` | `2` | Total attempts when output does not validate. |
| `UNPERFORMED_SERVER_FALLBACKS` | `1` | Use the API's server-side model fallback when the primary model is unavailable. Set `0` to disable. |
| `UNPERFORMED_ANTHROPIC_BASE_URL` | (none) | Override the API base URL (for a gateway). |
| `UNPERFORMED_ALLOWED_ORIGINS` | localhost dev ports | Comma-separated CORS origins. |

Cost estimates use the per-token prices in `src/unperformed_ai/config.py`.
They are approximate; check current pricing before relying on them.

## Test

```bash
uv run pytest          # contract, director and API tests, no network
uv run ruff check . && uv run ruff format --check .
uv run mypy src
```

The tests replace the HTTP transport with an in-memory fake, so they exercise
the real SDK request and response handling without a key or network access.
They do not prove that a real model produces good creative output; that has to
be checked with a real key (see `docs/en/evaluation.md`).
