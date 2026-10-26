import { EXAMPLE_INTENTS, MOODS, compileTimed, seedFor, type Mood } from "@unperformed/performance-core";
import { useState } from "react";
import { interpretIdea } from "../ai/director";
import { LiveError } from "../ai/live";
import { ModeLine } from "../components/TopBar";
import { useI18n } from "../i18n";
import { useStore } from "../state/store";

export function Imagine() {
  const { state, dispatch, live } = useStore();
  const { t, locale } = useI18n();
  const [text, setText] = useState(state.intent?.text ?? "");
  const [mood, setMood] = useState<Mood | null>(state.intent?.mood ?? null);
  const [duration, setDuration] = useState(state.intent?.durationSec ?? 75);
  const [busy, setBusy] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [empty, setEmpty] = useState(false);

  async function compose(mode: "demo" | "live") {
    const intent = text.trim();
    if (!intent) {
      setEmpty(true);
      return;
    }
    setEmpty(false);
    setLiveError(null);
    setBusy(true);
    const at = Date.now();
    if (mode !== state.mode) dispatch({ type: "set-mode", mode });
    dispatch({ type: "submit-intent", at, text: intent, mood, durationSec: duration });
    try {
      const r = await interpretIdea(mode, intent, mood, locale);
      dispatch({ type: "metric-latency", kind: "interpret", ms: r.ms, source: r.source.kind === "llm" ? r.source.model : "rules", ...(r.usage ? { usage: r.usage } : {}) });
      const { compiled, ms } = compileTimed(r.value, duration, seedFor(intent), () => performance.now());
      dispatch({ type: "interpretation-ready", at: Date.now(), interpretation: r.value, source: r.source, compiled, compileMs: ms });
    } catch (e) {
      const code = e instanceof LiveError ? e.code : "error";
      setLiveError(code);
      dispatch({ type: "fallback", at: Date.now(), reason: code, scope: "interpret" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="view imagine" aria-labelledby="imagine-title">
      <div className="imagine-grid">
        <div className="imagine-main">
          <p className="kicker">{t("imagine.kicker")}</p>
          <h1 id="imagine-title" className="display">
            {t("imagine.title")
              .split("\n")
              .map((line, i) => (
                <span key={i}>{line}</span>
              ))}
          </h1>
          <p className="lede">{t("imagine.lede")}</p>

          <form
            className="intent-form"
            onSubmit={(e) => {
              e.preventDefault();
              void compose(state.mode);
            }}
          >
            <label htmlFor="intent" className="label">
              {t("imagine.label")}
            </label>
            <textarea
              id="intent"
              className="intent"
              rows={4}
              maxLength={1000}
              value={text}
              placeholder={t("imagine.placeholder")}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void compose(state.mode);
              }}
              aria-invalid={empty}
              aria-describedby={empty ? "intent-empty" : undefined}
            />
            {empty && (
              <p id="intent-empty" className="field-error">
                {t("imagine.empty")}
              </p>
            )}

            <div className="intent-options">
              <label className="field">
                <span className="label">{t("imagine.mood")}</span>
                <select value={mood ?? ""} onChange={(e) => setMood((e.target.value || null) as Mood | null)}>
                  <option value="">{t("imagine.mood.auto")}</option>
                  {MOODS.map((m) => (
                    <option key={m} value={m}>
                      {t(`enum.${m}`)}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset className="field">
                <legend className="label">{t("imagine.length")}</legend>
                <div className="seg">
                  {([30, 60, 75] as const).map((d) => (
                    <button type="button" key={d} className={duration === d ? "is-on" : ""} aria-pressed={duration === d} onClick={() => setDuration(d)}>
                      {t(d === 30 ? "imagine.length.short" : d === 60 ? "imagine.length.standard" : "imagine.length.full")}
                    </button>
                  ))}
                </div>
              </fieldset>
            </div>

            <div className="actions">
              <button type="submit" className="btn btn-primary" disabled={busy} data-testid="compose">
                {busy ? (state.mode === "live" ? t("imagine.workingLive", { model: live.model ?? "" }) : t("imagine.working")) : t("imagine.submit")}
              </button>
              <ModeLine />
            </div>

            {liveError && (
              <div className="banner" role="alert">
                <span>{t("imagine.liveFailed", { code: liveError })}</span>
                <span className="banner-actions">
                  <button type="button" className="btn" onClick={() => void compose("demo")}>
                    {t("imagine.useDemo")}
                  </button>
                  <button type="button" className="link-btn" onClick={() => void compose("live")}>
                    {t("imagine.retry")}
                  </button>
                </span>
              </div>
            )}
          </form>
        </div>

        <aside className="imagine-side">
          <h2 className="label">{t("imagine.examples")}</h2>
          <ul className="examples">
            {EXAMPLE_INTENTS[locale].map((ex) => (
              <li key={ex}>
                <button type="button" className="example" onClick={() => setText(ex)}>
                  {ex}
                </button>
              </li>
            ))}
          </ul>
          <h2 className="label">{t("imagine.howItWorks")}</h2>
          <ol className="how">
            {([1, 2, 3, 4, 5, 6] as const).map((n) => (
              <li key={n}>{t(`imagine.how.${n}`)}</li>
            ))}
          </ol>
        </aside>
      </div>
    </section>
  );
}
