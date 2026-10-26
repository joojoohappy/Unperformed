import { buildReview, type SessionEvent } from "@unperformed/performance-core";
import { useMemo, useState } from "react";
import { ChangeList } from "../components/ChangeList";
import { SourceTag } from "../components/SourceTag";
import { Timeline, TimelineLabels } from "../components/Timeline";
import { useI18n } from "../i18n";
import { useStore } from "../state/store";

type Filter = "all" | "human" | "ai" | "system";

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function Review() {
  const { state, reset } = useStore();
  const { t, tx } = useI18n();
  const [filter, setFilter] = useState<Filter>("all");
  const review = useMemo(() => buildReview(state), [state]);
  const events = state.events.filter((e) => filter === "all" || e.actor === filter);
  const m = state.metrics;
  const lat = (kind: string) => m.latenciesMs.filter((x) => x.kind === kind).map((x) => Math.round(x.ms));

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `unperformed-session-${state.id.slice(0, 8)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <section className="view review" aria-labelledby="review-title">
      <p className="kicker">{t("review.kicker")}</p>
      <h1 id="review-title" className="display display-sm">
        {state.score?.title}
      </h1>
      <p className="lede">{t("review.intro")}</p>

      <div className="review-grid">
        <div className="review-main">
          <h2 className="label">{t("review.intent")}</h2>
          <blockquote className="intent-quote">{state.intent?.text}</blockquote>

          {state.originalScore && (
            <>
              <h2 className="label">{t("review.original")}</h2>
              <Timeline score={state.originalScore} compact label={t("review.original")} />
              <TimelineLabels score={state.originalScore} />
            </>
          )}
          {state.score && (
            <>
              <h2 className="label">{t("review.final")}</h2>
              <Timeline score={state.score} compact label={t("review.final")} />
              <TimelineLabels score={state.score} />
            </>
          )}

          <h2 className="label">{t("review.net")}</h2>
          {review.netChanges.length ? <ChangeList changes={review.netChanges} score={state.score} /> : <p className="muted">{t("review.netNone")}</p>}

          <div className="history-head">
            <h2 className="label">{t("review.decisions")}</h2>
            <div className="seg" role="group" aria-label={t("review.decisions")}>
              {(["all", "human", "ai", "system"] as const).map((f) => (
                <button key={f} className={filter === f ? "is-on" : ""} aria-pressed={filter === f} onClick={() => setFilter(f)}>
                  {t(`review.filter.${f}`)}
                </button>
              ))}
            </div>
          </div>
          <ol className="history" data-testid="history">
            {events.map((e) => (
              <EventRow key={e.seq} e={e} />
            ))}
          </ol>
        </div>

        <aside className="review-side">
          <div className="panel">
            <h2 className="label">{t("review.stats")}</h2>
            <dl className="stats">
              <div>
                <dt>{t("review.stats.human")}</dt>
                <dd className="human">{review.counts.human}</dd>
              </div>
              <div>
                <dt>{t("review.stats.ai")}</dt>
                <dd className="ai">{review.counts.ai - review.counts.aiLocal}</dd>
              </div>
              <div>
                <dt>{t("review.stats.local")}</dt>
                <dd className="ai">{review.counts.aiLocal}</dd>
              </div>
              <div>
                <dt>{t("review.stats.proposals")}</dt>
                <dd>{review.counts.proposals}</dd>
              </div>
            </dl>
            <p className="small">{t("review.stats.accepted", { human: review.counts.accepted.human, ai: review.counts.accepted.ai, combined: review.counts.accepted.combined })}</p>
          </div>

          <div className="panel" data-testid="telemetry">
            <h2 className="label">{t("review.telemetry")}</h2>
            <dl className="kv mono small">
              <dt>{t("review.telemetry.calls")}</dt>
              <dd>{m.modelCalls}</dd>
              <dt>{t("review.telemetry.tokens")}</dt>
              <dd>
                {m.inputTokens} / {m.outputTokens}
              </dd>
              <dt>{t("review.telemetry.cost")}</dt>
              <dd>${m.estimatedCostUsd.toFixed(4)}</dd>
              <dt>{t("review.telemetry.latency")}</dt>
              <dd>
                {(["interpret", "negotiate", "combine"] as const)
                  .filter((k) => lat(k).length)
                  .map((k) => `${t(`enum.${k === "combine" ? "combined" : k}`)} ${lat(k).join(", ")} ms`)
                  .join(" · ") || "—"}
              </dd>
              <dt>{t("review.telemetry.compile")}</dt>
              <dd>{m.compileMs.map((x) => `${x.toFixed(2)} ms`).join(", ") || "—"}</dd>
              <dt>{t("review.telemetry.fps")}</dt>
              <dd>{m.performances.map((p) => `${p.avgFps} fps / ${p.p95FrameMs} ms (${p.renderer})`).join(" · ") || "—"}</dd>
            </dl>
            {m.modelCalls === 0 && <p className="small muted">{t("review.telemetry.none")}</p>}
          </div>

          <div className="actions actions-col">
            <button className="btn" onClick={exportJson}>
              {t("review.export")}
            </button>
            <button className="btn btn-primary" onClick={() => reset()}>
              {t("review.restart")}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );

  function EventRow({ e }: { e: SessionEvent }) {
    const text = (e.data?.["text"] as string | undefined) ?? null;
    return (
      <li className={`event actor-${e.actor} type-${e.type}`}>
        <span className="mono muted ev-time">{fmtTime(e.at)}</span>
        <span className={`ev-actor ${e.actor}`}>{t(`review.actor.${e.actor}`)}</span>
        <div className="ev-body">
          <p>{tx(e.summary)}</p>
          {text && <p className="ev-quote">“{text}”</p>}
          {e.source && <SourceTag source={e.source} />}
          {e.changes && e.changes.length > 0 && <ChangeList changes={e.changes} score={state.score} limit={8} />}
        </div>
      </li>
    );
  }
}
