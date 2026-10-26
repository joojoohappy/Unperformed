import { Component, useEffect, type ReactNode } from "react";
import { health } from "./ai/live";
import { ErrorBanner, TopBar } from "./components/TopBar";
import { I18nProvider, format } from "./i18n";
import { useStore } from "./state/store";
import { Compose } from "./views/Compose";
import { Imagine } from "./views/Imagine";
import { Negotiate } from "./views/Negotiate";
import { Perform } from "./views/Perform";
import { Rehearse } from "./views/Rehearse";
import { Review } from "./views/Review";

export function App() {
  const { state, setLive, dispatch } = useStore();

  useEffect(() => {
    let alive = true;
    void health().then((h) => {
      if (!alive) return;
      const available = !!h?.liveAvailable;
      setLive({ checked: true, available, model: h?.model ?? null });
      if (!available && state.mode === "live") dispatch({ type: "set-mode", mode: "demo" });
    });
    return () => {
      alive = false;
    };
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [state.stage]);

  const stage = state.score ? state.stage : "imagine";
  return (
    <I18nProvider locale={state.locale}>
      <div className={`app at-${stage}`} data-stage={stage}>
        <TopBar />
        <ErrorBanner />
        <main id="main">
          <Boundary locale={state.locale}>
            {stage === "imagine" && <Imagine />}
            {stage === "compose" && <Compose />}
            {stage === "negotiate" && <Negotiate />}
            {stage === "rehearse" && <Rehearse />}
            {stage === "perform" && <Perform />}
            {stage === "review" && <Review />}
          </Boundary>
        </main>
      </div>
    </I18nProvider>
  );
}

class Boundary extends Component<{ children: ReactNode; locale: "en" | "zh-TW" }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override render() {
    if (this.state.error) {
      return (
        <div className="view" role="alert">
          <p className="lede">{format(this.props.locale, "error.boundary")}</p>
          <pre className="small muted">{this.state.error.message}</pre>
          <button className="btn" onClick={() => location.reload()}>
            {format(this.props.locale, "error.reload")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
