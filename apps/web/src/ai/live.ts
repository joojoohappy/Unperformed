/**
 * Client for the optional Live AI service (services/ai).
 *
 * The browser never holds an API key. It calls same-origin /api/* (proxied
 * to the Python service in development), and validates every response again
 * with the shared zod schemas before anything reaches the engine.
 */
import {
  CallMeta,
  CombinedAdvice,
  Interpretation,
  RequestAnalysis,
  type Locale,
  type Mood,
  type PerformanceScore,
  validateWith
} from "@unperformed/performance-core";
import { z } from "zod";

export type LiveMeta = CallMeta;

const BASE = (import.meta.env["VITE_AI_BASE"] as string | undefined) ?? "./api";

export class LiveError extends Error {
  constructor(
    public code: string,
    message: string
  ) {
    super(message);
  }
}

async function post<T>(path: string, body: unknown, schema: z.ZodType<T>, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(`${BASE}/${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal
    });
  } catch (e) {
    throw new LiveError(ctrl.signal.aborted ? "timeout" : "network", String(e));
  } finally {
    clearTimeout(timer);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new LiveError("bad_response", `HTTP ${res.status}`);
  }
  if (!res.ok) {
    const detail = (json as { detail?: { code?: string; detail?: string } }).detail;
    throw new LiveError(detail?.code ?? `http_${res.status}`, detail?.detail ?? `HTTP ${res.status}`);
  }
  const v = validateWith(schema, json);
  if (!v.ok) throw new LiveError("invalid_model_output", v.errors.slice(0, 3).join("; "));
  return v.value;
}

const Health = z.object({ status: z.literal("ok"), provider: z.string(), model: z.string(), liveAvailable: z.boolean(), version: z.string() });

/** Static builds (e.g. GitHub Pages) set VITE_LIVE_AI=off: there is no service to ask. */
const LIVE_DISABLED = import.meta.env["VITE_LIVE_AI"] === "off";

export async function health(timeoutMs = 1500): Promise<z.infer<typeof Health> | null> {
  if (LIVE_DISABLED) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/health`, { signal: ctrl.signal });
    if (!res.ok) return null;
    const v = Health.safeParse(await res.json());
    return v.success ? v.data : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function interpret(intent: string, mood: Mood | null, locale: Locale) {
  return post("interpret", { intent, mood, locale }, z.object({ interpretation: Interpretation, meta: CallMeta }), 90_000);
}

export function analyze(args: { request: string; score: PerformanceScore; decidedTopics: string[]; strategy: string; locale: Locale }) {
  const { score } = args;
  return post(
    "negotiate",
    {
      locale: args.locale,
      request: args.request,
      strategy: args.strategy.slice(0, 240),
      decidedTopics: args.decidedTopics,
      sections: score.sections.map((s) => ({
        id: s.id,
        name: s.name,
        archetype: s.archetype,
        lengthBeats: s.lengthBeats,
        energyFrom: s.energy.from,
        energyTo: s.energy.to,
        release: s.release ? `${s.release.mode}:${s.release.holdBeats}` : null
      })),
      constraints: score.constraints.map((c) => ({ kind: c.kind, text: c.text, status: c.status }))
    },
    z.object({ analysis: RequestAnalysis, meta: CallMeta }),
    45_000
  );
}

export function combine(args: { request: string; humanPlan: string; aiProposal: string; climaxLengthBeats: number; locale: Locale }) {
  return post("combine", args, z.object({ advice: CombinedAdvice, meta: CallMeta }), 45_000);
}
