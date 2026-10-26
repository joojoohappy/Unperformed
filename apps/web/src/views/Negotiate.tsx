import type { NegotiationRound, OptionId } from "@unperformed/performance-core";
import { useState } from "react";
import { combineAdvice, negotiate } from "../ai/director";
import { ChangeList } from "../components/ChangeList";
import { SourceTag } from "../components/SourceTag";
import { Timeline, TimelineLabels } from "../components/Timeline";
import { useI18n } from "../i18n";
import { newId, useStore } from "../state/store";

export function Negotiate() {
  const { state, dispatch } = useStore();
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const score = state.score!;
  const open = state.rounds.find((r) => r.status === "open");

  async function send(request: string) {
    const r = request.trim();
    if (!r || busy) return;
    setBusy(true);
    const res = await negotiate(state, r, { round: newId(), request: newId() });
    if (res.fallbackReason) dispatch({ type: "fallback", at: Date.now(), reason: res.fallbackReason, scope: "negotiate" });
    dispatch({
      type: "metric-latency",
      kind: "negotiate",
      ms: res.ms,
      source: res.round.source.kind === "llm" ? res.round.source.model : res.round.source.kind,
      ...(res.usage ? { usage: res.usage } : {})
    });
    dispatch({ type: "open-round", at: Date.now(), round: res.round });
    setText("");
    setBusy(false);
  }

  async function combine(round: NegotiationRound) {
    setBusy(true);
    const res = await combineAdvice(state, round);
    if (res.fallbackReason) dispatch({ type: "fallback", at: Date.now(), reason: res.fallbackReason, scope: "negotiate" });
    if (state.mode === "live") dispatch({ type: "metric-latency", kind: "combine", ms: res.ms, source: res.advice?.source.kind === "llm" ? res.advice.source.model : "rules", ...(res.usage ? { usage: res.usage } : {}) });
    dispatch({ type: "combine", at: Date.now(), roundId: round.id, advice: res.advice });
    setBusy(false);
  }

  return (
    <section className="view negotiate" aria-labelledby="negotiate-title">
      <div className="negotiate-grid">
        <div className="negotiate-main">
          <p className="kicker">{t("negotiate.kicker")}</p>
          <h1 id="negotiate-title" className="display display-sm">
            {score.title}
          </h1>
          <p className="lede">{t("negotiate.intro")}</p>

          <form
            className="request-form"
            onSubmit={(e) => {
              e.preventDefault();
              void send(text);
            }}
          >
            <label htmlFor="request" className="label">
              {t("negotiate.label")}
            </label>
            <div className="request-row">
              <input id="request" className="request" value={text} maxLength={500} placeholder={t("negotiate.placeholder")} onChange={(e) => setText(e.target.value)} disabled={!!open || busy} />
              <button className="btn btn-primary" type="submit" disabled={!!open || busy || !text.trim()} data-testid="send-request">
                {t("negotiate.send")}
              </button>
            </div>
            <div className="suggestions">
              <span className="label">{t("negotiate.try")}</span>
              {([1, 2, 3, 4, 5, 6, 7] as const).map((n) => (
                <button type="button" key={n} className="chip" disabled={!!open || busy} onClick={() => setText(t(`negotiate.suggest.${n}`))} data-testid={`suggest-${n}`}>
                  {t(`negotiate.suggest.${n}`)}
                </button>
              ))}
            </div>
          </form>

          {busy && <p className="working" aria-live="polite">{t("negotiate.working")}</p>}

          <h2 className="label">{t("negotiate.history")}</h2>
          {state.rounds.length === 0 && <p className="muted">{t("negotiate.empty")}</p>}
          <ol className="rounds" aria-live="polite">
            {[...state.rounds].reverse().map((r) => (
              <Round key={r.id} round={r} busy={busy} onCombine={() => void combine(r)} onChoose={(id) => dispatch({ type: "resolve", at: Date.now(), roundId: r.id, optionId: id })} />
            ))}
          </ol>
        </div>

        <aside className="negotiate-side">
          <h2 className="label">{t("compose.structure")}</h2>
          <Timeline score={score} compact label={t("compose.structure")} />
          <TimelineLabels score={score} />
          <h2 className="label">{t("compose.constraints")}</h2>
          <ul className="constraints compact">
            {score.constraints.map((c) => (
              <li key={c.id} className={`constraint is-${c.status}`}>
                <span className="constraint-text">{c.text}</span>
                <span className={`pill ${c.status === "approved" ? "pill-human" : ""}`}>{t(c.status === "approved" ? "compose.approved" : "compose.proposed")}</span>
              </li>
            ))}
            {score.constraints.length === 0 && <li className="muted">{t("compose.constraints.none")}</li>}
          </ul>
          <div className="actions">
            <button className="btn btn-primary" disabled={!!open} onClick={() => dispatch({ type: "goto", stage: "rehearse" })} data-testid="to-rehearse">
              {t("negotiate.continue")}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function Round({ round, busy, onChoose, onCombine }: { round: NegotiationRound; busy: boolean; onChoose: (id: OptionId) => void; onCombine: () => void }) {
  const { t, tx } = useI18n();
  const { state } = useStore();
  const resolved = round.status === "resolved";
  return (
    <li className={`round round-${round.kind} ${resolved ? "is-resolved" : ""}`} data-testid="round" data-kind={round.kind}>
      <div className="line line-human">
        <span className="who human">{t("negotiate.you")}</span>
        <p>{round.request.text}</p>
      </div>
      <div className="line line-ai">
        <span className="who ai">{t("negotiate.director")}</span>
        <div>
          <p className="round-kind mono">{t(`negotiate.kind.${round.kind}`)}</p>
          <p className="director-msg">{tx(round.message)}</p>
          <p className="small">
            <SourceTag source={round.source} />
          </p>
        </div>
      </div>
      {round.options.length > 0 && (
        <div className="options">
          {round.options.map((o) => {
            const chosen = round.resolution?.optionId === o.id;
            return (
              <div key={o.id} className={`option option-${o.id} ${chosen ? "is-chosen" : ""} ${resolved && !chosen ? "is-dim" : ""}`} data-testid={`option-${o.id}`}>
                <h3>{tx(o.label)}</h3>
                <p className="small">{tx(o.description)}</p>
                <p className="label">{t("negotiate.preview")}</p>
                <ChangeList changes={chosen && round.resolution ? round.resolution.changes : o.changes} score={state.score} limit={6} />
                {o.blockedBy && <p className="field-error">{tx(o.blockedBy)}</p>}
                {!resolved ? (
                  <button className="btn" disabled={!o.allowed || busy} onClick={() => onChoose(o.id)} data-testid={`choose-${o.id}`}>
                    {t("negotiate.choose")}
                  </button>
                ) : (
                  chosen && <span className="pill pill-human">{t("negotiate.chosen")}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
      {!resolved && round.canCombine && (
        <button className="link-btn combine" disabled={busy} onClick={onCombine} data-testid="combine">
          {t("negotiate.combine")}
        </button>
      )}
    </li>
  );
}
