import { durationSeconds, type StageFrame } from "@unperformed/performance-core";
import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { Transport } from "../playback/transport";
import { Stage, type FrameStats } from "../stage/Stage";
import { useStore } from "../state/store";

type Phase = "ready" | "running" | "paused" | "ended";

export function Perform() {
  const { state, dispatch, prefs } = useStore();
  const { t } = useI18n();
  const score = state.score!;
  const transport = useRef(new Transport());
  const [phase, setPhase] = useState<Phase>("ready");
  const [hud, setHud] = useState({ section: score.sections[0]!.name, seconds: 0 });
  const [master, setMaster] = useState(1);
  const [blackout, setBlackout] = useState(false);
  const [stats, setStats] = useState<FrameStats | null>(null);
  const [noAudio, setNoAudio] = useState(false);
  const phaseRef = useRef<Phase>("ready");
  phaseRef.current = phase;
  const statsRef = useRef<FrameStats | null>(null);
  const lastHud = useRef(0);

  useEffect(() => {
    const tr = transport.current;
    return () => tr.stop();
  }, []);

  const begin = useCallback(async () => {
    statsRef.current = null;
    setStats(null);
    await transport.current.play(score, 0, prefs.sound);
    setNoAudio(prefs.sound && transport.current.audioFailed);
    setPhase("running");
    dispatch({ type: "performance", at: Date.now(), phase: "started" });
  }, [score, prefs.sound, dispatch]);

  const togglePause = useCallback(async () => {
    const tr = transport.current;
    if (phaseRef.current === "running") {
      await tr.pause();
      setPhase("paused");
      dispatch({ type: "intervention", at: Date.now(), what: "pause" });
    } else if (phaseRef.current === "paused") {
      await tr.resume();
      setPhase("running");
      dispatch({ type: "intervention", at: Date.now(), what: "resume" });
    }
  }, [dispatch]);

  const stop = useCallback(() => {
    transport.current.stop();
    setPhase("ended");
    dispatch({ type: "performance", at: Date.now(), phase: "stopped", ...(statsRef.current ? { stats: statsRef.current } : {}) });
  }, [dispatch]);

  const blackoutRef = useRef(false);
  blackoutRef.current = blackout;
  const toggleBlackout = useCallback(() => {
    const next = !blackoutRef.current;
    blackoutRef.current = next;
    setBlackout(next);
    dispatch({ type: "intervention", at: Date.now(), what: next ? "blackout-on" : "blackout-off" });
  }, [dispatch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("input, select, textarea")) return;
      if (e.code === "Space" && (phaseRef.current === "running" || phaseRef.current === "paused")) {
        e.preventDefault();
        void togglePause();
      } else if (e.key === "b" && phaseRef.current !== "ready") toggleBlackout();
      else if (e.key === "Escape" && phaseRef.current !== "ready" && phaseRef.current !== "ended") stop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePause, toggleBlackout, stop]);

  useEffect(() => {
    transport.current.setVolume(blackout ? 0.25 : 0.9);
  }, [blackout]);

  const onFrame = (f: StageFrame) => {
    if (phaseRef.current === "running" && f.ended) {
      transport.current.stop();
      setPhase("ended");
      dispatch({ type: "performance", at: Date.now(), phase: "completed", ...(statsRef.current ? { stats: statsRef.current } : {}) });
    }
    const now = performance.now();
    if (now - lastHud.current > 200) {
      lastHud.current = now;
      setHud({ section: score.sections[f.sectionIndex]!.name, seconds: f.seconds });
    }
  };

  const beat = () => (phaseRef.current === "ready" ? 0 : phaseRef.current === "ended" ? score.totalBeats : transport.current.beat());

  return (
    <section className="view perform" aria-labelledby="perform-title">
      <h1 id="perform-title" className="sr-only">
        {t("perform.kicker")} · {score.title}
      </h1>
      <Stage
        score={score}
        beat={beat}
        options={{ masterIntensity: master, forceBlackout: blackout }}
        reducedMotion={prefs.reducedMotion}
        onFrame={onFrame}
        measure={phase === "running"}
        onStats={(s) => {
          statsRef.current = s;
          setStats(s);
        }}
        className="stage-perform"
        label={score.title}
      />

      {phase === "ready" && (
        <div className="perform-overlay">
          <p className="kicker">{t("perform.kicker")}</p>
          <p className="display display-sm">{score.title}</p>
          <button className="btn btn-primary btn-large" onClick={() => void begin()} data-testid="begin" autoFocus>
            {t("perform.begin")}
          </button>
          <p className="small muted">{t("perform.beginHint", { seconds: Math.round(durationSeconds(score)) })}</p>
        </div>
      )}

      {phase === "ended" && (
        <div className="perform-overlay" data-testid="perform-ended">
          <p className="display display-sm">{t("perform.ended")}</p>
          <div className="actions">
            <button className="btn btn-primary" onClick={() => dispatch({ type: "goto", stage: "review" })} data-testid="to-review" autoFocus>
              {t("perform.toReview")}
            </button>
            <button className="btn" onClick={() => void begin()}>
              {t("perform.again")}
            </button>
          </div>
        </div>
      )}

      {(phase === "running" || phase === "paused") && (
        <div className="hud">
          <div className="hud-left mono">
            <span className="hud-section">{hud.section}</span>
            <span>
              {hud.seconds.toFixed(1)} / {durationSeconds(score).toFixed(0)} s
            </span>
            {stats && <span className="muted">{t("perform.fps", { fps: stats.avgFps })} · {t("perform.renderer", { name: stats.renderer })}{stats.quality === "reduced" && <> · {t("perform.quality.reduced")}</>}</span>}
            {noAudio && <span className="warn">{t("perform.noAudio")}</span>}
          </div>
          <div className="hud-controls">
            <button className="btn" onClick={() => void togglePause()} data-testid="pause">
              {phase === "running" ? t("perform.pause") : t("perform.resume")}
            </button>
            <button className={`btn ${blackout ? "is-on" : ""}`} aria-pressed={blackout} onClick={toggleBlackout}>
              {t("perform.blackout")}
            </button>
            <label className="field range inline">
              <span className="label">{t("perform.master")}</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={master}
                onChange={(e) => setMaster(Number(e.target.value))}
                onPointerUp={() => dispatch({ type: "intervention", at: Date.now(), what: "master", value: master })}
              />
            </label>
            <button className="btn" onClick={stop} data-testid="stop">
              {t("perform.stop")}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
