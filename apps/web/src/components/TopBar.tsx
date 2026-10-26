import { STAGES, type Stage } from "@unperformed/performance-core";
import { useI18n } from "../i18n";
import { useStore } from "../state/store";

export function TopBar() {
  const { state, dispatch, prefs, setPrefs, live, reset } = useStore();
  const { t } = useI18n();
  const go = (s: Stage) => dispatch({ type: "goto", stage: s });
  return (
    <header className="topbar">
      <a className="skip" href="#main">
        {t("app.skip")}
      </a>
      <button className="wordmark" onClick={() => go("imagine")} aria-label="UNPERFORMED">
        UNPERFORMED
      </button>
      <nav className="stepper" aria-label="Workflow">
        <ol>
          {STAGES.map((s, i) => {
            const locked = s !== "imagine" && !state.score;
            return (
              <li key={s}>
                <button
                  className={`step ${state.stage === s ? "is-current" : ""}`}
                  aria-current={state.stage === s ? "step" : undefined}
                  disabled={locked}
                  title={locked ? t("stage.locked") : undefined}
                  onClick={() => go(s)}
                  data-stage={s}
                  aria-label={`${String(i + 1).padStart(2, "0")} ${t(`stage.${s}`)}`}
                >
                  <span className="step-n">{String(i + 1).padStart(2, "0")}</span>
                  <span className="step-label">{t(`stage.${s}`)}</span>
                </button>
              </li>
            );
          })}
        </ol>
      </nav>
      <div className="topbar-tools">
        <div className="mode" role="group" aria-label={t("mode.switch")}>
          <button
            className={`mode-btn ${state.mode === "demo" ? "is-on" : ""}`}
            aria-pressed={state.mode === "demo"}
            onClick={() => dispatch({ type: "set-mode", mode: "demo" })}
            title={t("mode.demo.long")}
            data-testid="mode-demo"
          >
            {t("mode.demo")}
          </button>
          <button
            className={`mode-btn ${state.mode === "live" ? "is-on" : ""}`}
            aria-pressed={state.mode === "live"}
            disabled={!live.available}
            onClick={() => dispatch({ type: "set-mode", mode: "live" })}
            title={live.available ? t("mode.live.long", { model: live.model ?? "" }) : t("mode.live.unavailable")}
            data-testid="mode-live"
          >
            {t("mode.live")}
          </button>
        </div>
        <div className="lang" role="group" aria-label={t("settings.language")}>
          <button className={state.locale === "en" ? "is-on" : ""} aria-pressed={state.locale === "en"} onClick={() => dispatch({ type: "set-locale", locale: "en" })} lang="en">
            EN
          </button>
          <button className={state.locale === "zh-TW" ? "is-on" : ""} aria-pressed={state.locale === "zh-TW"} onClick={() => dispatch({ type: "set-locale", locale: "zh-TW" })} lang="zh-TW">
            繁中
          </button>
        </div>
        <label className="toggle" title={t("settings.reducedMotion")}>
          <input type="checkbox" checked={prefs.reducedMotion} onChange={(e) => setPrefs({ reducedMotion: e.target.checked })} />
          <span>{t("settings.reducedMotion")}</span>
        </label>
        <label className="toggle" title={t("settings.sound")}>
          <input type="checkbox" checked={prefs.sound} onChange={(e) => setPrefs({ sound: e.target.checked })} />
          <span>{t("settings.sound")}</span>
        </label>
        <button
          className="link-btn"
          onClick={() => {
            if (!state.score || confirm(t("settings.newConfirm"))) reset();
          }}
        >
          {t("settings.new")}
        </button>
      </div>
    </header>
  );
}

export function ModeLine() {
  const { state, live } = useStore();
  const { t } = useI18n();
  return (
    <p className={`mode-line mode-line-${state.mode}`} data-testid="mode-line">
      <span className="dot" aria-hidden="true" />
      {state.mode === "demo" ? t("mode.demo.long") : t("mode.live.long", { model: live.model ?? "" })}
    </p>
  );
}

export function ErrorBanner() {
  const { state, dispatch } = useStore();
  const { t, tx } = useI18n();
  if (!state.lastError) return null;
  return (
    <div className="banner" role="alert">
      <span>{tx(state.lastError)}</span>
      <button className="link-btn" onClick={() => dispatch({ type: "clear-error" })}>
        {t("error.dismiss")}
      </button>
    </div>
  );
}
