import { durationSeconds } from "@unperformed/performance-core";
import { useRef } from "react";
import { SourceTag } from "../components/SourceTag";
import { Timeline, TimelineLabels } from "../components/Timeline";
import { useI18n } from "../i18n";
import { Stage } from "../stage/Stage";
import { useStore } from "../state/store";

export function Compose() {
  const { state, dispatch, prefs } = useStore();
  const { t, tx } = useI18n();
  const score = state.score!;
  const interp = state.interpretation!;
  const start = useRef(performance.now());
  // A silent looping preview: no audio, no model calls, just the score.
  const loopBeat = () => (((performance.now() - start.current) / 1000) * (score.tempoBpm / 60)) % score.totalBeats;

  return (
    <section className="view compose" aria-labelledby="compose-title">
      <div className="compose-head">
        <div>
          <p className="kicker">{t("compose.kicker")}</p>
          <h1 id="compose-title" className="display display-sm">
            {score.title}
          </h1>
          <p className="lede">{score.summary}</p>
          <p className="meta mono">
            {t("compose.duration", { seconds: Math.round(durationSeconds(score)), beats: score.totalBeats, bpm: score.tempoBpm })} · {t(`enum.${score.mood}`)}
          </p>
        </div>
        <Stage score={score} beat={loopBeat} reducedMotion={prefs.reducedMotion} className="stage-preview" label={score.title} captions />
      </div>

      <div className="score-strip">
        <h2 className="label">{t("compose.structure")}</h2>
        <Timeline score={score} label={t("compose.structure")} />
        <TimelineLabels score={score} />
        <div className="section-table" role="table" aria-label={t("compose.structure")}>
          {score.sections.map((s) => (
            <div role="row" key={s.id} className="section-row">
              <span role="cell" className="swatch" style={{ background: s.lighting.key }} aria-hidden="true" />
              <span role="cell" className="sec-name">{s.name}</span>
              <span role="cell" className="mono muted">{t(`enum.${s.archetype}`)}</span>
              <span role="cell" className="mono">{s.lengthBeats}</span>
              <span role="cell">{t(`enum.${s.geometry.form}`)}</span>
              <span role="cell">{t(`enum.${s.camera.move}`)}</span>
              <span role="cell">{t(`enum.${s.sound.texture}`)}</span>
              <span role="cell" className="mono">
                {s.release ? `${t(`enum.${s.release.mode}`)}${s.release.holdBeats ? ` · ${s.release.holdBeats}` : ""}` : ""}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="compose-cols">
        <div className="panel">
          <h2 className="label">{t("compose.understood")}</h2>
          <ul className="understood">
            {interp.understood.map((u) => (
              <li key={u}>{u}</li>
            ))}
          </ul>
          <p className="small muted">
            {t("compose.understoodBy", { source: "" })}
            {state.interpretationSource && <SourceTag source={state.interpretationSource} />}
          </p>
          <h2 className="label">{t("compose.strategy")}</h2>
          <p className="strategy">{interp.strategy}</p>
        </div>

        <div className="panel">
          <h2 className="label">{t("compose.constraints")}</h2>
          <p className="small muted">{t("compose.constraints.help")}</p>
          {score.constraints.length === 0 && <p className="muted">{t("compose.constraints.none")}</p>}
          <ul className="constraints">
            {score.constraints.map((c) => (
              <li key={c.id} className={`constraint is-${c.status}`} data-testid={`constraint-${c.kind}`}>
                <span className="constraint-text">{c.text}</span>
                {c.status === "approved" ? (
                  <span className="pill pill-human">{t("compose.approved")}</span>
                ) : (
                  <span className="constraint-actions">
                    <span className="pill">{t("compose.proposed")}</span>
                    <button className="btn btn-small" onClick={() => dispatch({ type: "constraint-status", at: Date.now(), constraintId: c.id, status: "approved" })}>
                      {t("compose.approve")}
                    </button>
                    <button className="link-btn" onClick={() => dispatch({ type: "constraint-status", at: Date.now(), constraintId: c.id, status: "rejected" })}>
                      {t("compose.reject")}
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="panel">
          <h2 className="label">{t("compose.decisions")}</h2>
          <p className="small muted">{t("compose.decisions.help")}</p>
          <ul className="decisions">
            {state.localDecisions.map((d) => (
              <li key={`${d.sectionId}.${d.field}`}>
                <span className="mono ai">{score.sections.find((s) => s.id === d.sectionId)?.name}</span> {tx(d.reason)}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <details className="json">
        <summary>{t("compose.json")}</summary>
        <pre>{JSON.stringify(score, null, 2)}</pre>
      </details>

      <div className="actions actions-end">
        <button className="btn btn-primary" onClick={() => dispatch({ type: "goto", stage: "negotiate" })} data-testid="to-negotiate">
          {t("compose.continue")}
        </button>
      </div>
    </section>
  );
}
