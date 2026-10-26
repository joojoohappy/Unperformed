import { CAMERA_MOVES, GEOMETRY_FORMS, RELEASE_MODES, round3, type PatchOp, type ReleaseMode, type Section, type StageFrame } from "@unperformed/performance-core";
import { useEffect, useRef, useState } from "react";
import { CommitRange } from "../components/CommitRange";
import { Timeline, TimelineLabels } from "../components/Timeline";
import { useI18n } from "../i18n";
import { Transport } from "../playback/transport";
import { Stage } from "../stage/Stage";
import { useStore } from "../state/store";

export function Rehearse() {
  const { state, dispatch, prefs } = useStore();
  const { t } = useI18n();
  const score = state.score!;
  const transport = useRef(new Transport());
  const climax = score.sections.find((s) => s.archetype === "climax");
  // Open on the moment just after the climax releases: the most telling frame of the piece.
  const scrub = useRef(climax ? climax.startBeat + (climax.release && climax.release.mode !== "immediate" ? climax.release.holdBeats : 0) + 2 : 0);
  const [beat, setBeat] = useState(scrub.current);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<string>(climax?.id ?? score.sections[0]!.id);
  const section = score.sections.find((s) => s.id === selected) ?? score.sections[0]!;
  const lastUi = useRef(0);
  // The opening frame is a preview; until the user seeks, Play runs the whole piece from the start.
  const moved = useRef(false);

  useEffect(() => {
    const tr = transport.current;
    return () => tr.stop();
  }, []);

  // Score edits during playback: restart sound from the current beat so audio matches the new score.
  useEffect(() => {
    const tr = transport.current;
    if (tr.state === "playing") void tr.play(score, tr.beat(), prefs.sound);
  }, [score, prefs.sound]);

  const beatFn = () => (transport.current.state === "playing" ? transport.current.beat() : scrub.current);

  const onFrame = (f: StageFrame) => {
    const now = performance.now();
    if (transport.current.state === "playing") {
      scrub.current = f.beat;
      if (f.ended || transport.current.beat() >= score.totalBeats) {
        transport.current.stop();
        scrub.current = 0;
        setPlaying(false);
      }
    }
    if (now - lastUi.current > 90) {
      lastUi.current = now;
      setBeat(scrub.current);
    }
  };

  async function toggle() {
    const tr = transport.current;
    if (tr.state === "playing") {
      tr.stop();
      setPlaying(false);
    } else {
      if (!moved.current) {
        moved.current = true;
        scrub.current = 0;
      }
      await tr.play(score, scrub.current, prefs.sound);
      setPlaying(true);
    }
  }

  function seek(b: number) {
    moved.current = true;
    scrub.current = b;
    setBeat(b);
    if (transport.current.state === "playing") void transport.current.play(score, b, prefs.sound);
  }

  function select(id: string) {
    setSelected(id);
    const s = score.sections.find((x) => x.id === id);
    if (s) seek(s.startBeat + Math.min(2, s.lengthBeats / 4));
  }

  const edit = (op: PatchOp) => dispatch({ type: "human-edit", at: Date.now(), patch: { ops: [op] }, label: { key: "rehearse.edit", params: { section: section.name } } });
  const peak = Math.max(section.energy.from, section.energy.to);
  const lockedHere = score.humanLocked.some((p) => p.startsWith(`${section.id}.`));

  return (
    <section className="view rehearse" aria-labelledby="rehearse-title">
      <div className="rehearse-grid">
        <div className="rehearse-stage">
          <Stage score={score} beat={beatFn} reducedMotion={prefs.reducedMotion} onFrame={onFrame} className="stage-rehearse" label={score.title} captions />
          <div className="transport">
            <button className="btn btn-primary" onClick={() => void toggle()} data-testid="rehearse-play">
              {playing ? t("rehearse.pause") : t("rehearse.play")}
            </button>
            <span className="mono time">
              {(beat * (60 / score.tempoBpm)).toFixed(1)}s / {(score.totalBeats * (60 / score.tempoBpm)).toFixed(0)}s
            </span>
          </div>
          <Timeline score={score} selected={selected} onSelect={select} playhead={beat} onSeek={seek} label={t("rehearse.section")} />
          <TimelineLabels score={score} selected={selected} />
        </div>

        <aside className="rehearse-side">
          <p className="kicker">{t("rehearse.kicker")}</p>
          <h1 id="rehearse-title" className="display display-sm">
            {section.name}
          </h1>
          <p className="small muted">{t("rehearse.intro")}</p>
          <label className="field">
            <span className="label">{t("rehearse.section")}</span>
            <select value={selected} onChange={(e) => select(e.target.value)} data-testid="section-select">
              {score.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {t(`enum.${s.archetype}`)}
                </option>
              ))}
            </select>
          </label>

          <h2 className="label">{t("rehearse.adjust")}</h2>
          <SectionControls section={section} peak={peak} edit={edit} />
          {lockedHere && <p className="small human-note">{t("rehearse.locked")}</p>}

          <div className="actions">
            <button className="btn" onClick={() => dispatch({ type: "goto", stage: "negotiate" })}>
              {t("rehearse.back")}
            </button>
            <button className="btn btn-primary" onClick={() => dispatch({ type: "goto", stage: "perform" })} data-testid="to-perform">
              {t("rehearse.perform")}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

function SectionControls({ section, peak, edit }: { section: Section; peak: number; edit: (op: PatchOp) => void }) {
  const { t } = useI18n();
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  return (
    <div className="controls" key={section.id}>
      <CommitRange
        label={t("rehearse.intensity")}
        value={section.lighting.intensity}
        min={0}
        max={1}
        step={0.01}
        format={pct}
        testId="intensity"
        onCommit={(v) => edit({ op: "setLighting", sectionId: section.id, intensity: v })}
      />
      <CommitRange
        label={t("rehearse.energy")}
        value={round3(peak)}
        min={0}
        max={1}
        step={0.01}
        format={pct}
        onCommit={(v) => {
          const k = peak > 0 ? v / peak : 0;
          edit({ op: "setEnergy", sectionId: section.id, from: round3(Math.min(1, section.energy.from * k)), to: round3(Math.min(1, section.energy.to * k)) });
        }}
      />
      <label className="field">
        <span className="label">{t("rehearse.camera")}</span>
        <select value={section.camera.move} onChange={(e) => edit({ op: "setCamera", sectionId: section.id, move: e.target.value as Section["camera"]["move"] })} data-testid="camera-select">
          {CAMERA_MOVES.map((m) => (
            <option key={m} value={m}>
              {t(`enum.${m}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="field">
        <span className="label">{t("rehearse.form")}</span>
        <select value={section.geometry.form} onChange={(e) => edit({ op: "setGeometry", sectionId: section.id, form: e.target.value as Section["geometry"]["form"] })}>
          {GEOMETRY_FORMS.map((m) => (
            <option key={m} value={m}>
              {t(`enum.${m}`)}
            </option>
          ))}
        </select>
      </label>
      <label className="field field-inline">
        <span className="label">{t("rehearse.key")}</span>
        <input type="color" value={section.lighting.key} onChange={(e) => edit({ op: "setLighting", sectionId: section.id, key: e.target.value })} />
      </label>
      {section.release && (
        <>
          <label className="field">
            <span className="label">{t("rehearse.release")}</span>
            <select value={section.release.mode} onChange={(e) => edit({ op: "setRelease", sectionId: section.id, mode: e.target.value as ReleaseMode, holdBeats: section.release!.holdBeats })} data-testid="release-select">
              {RELEASE_MODES.map((m) => (
                <option key={m} value={m}>
                  {t(`enum.${m}`)}
                </option>
              ))}
            </select>
          </label>
          <CommitRange
            label={t("rehearse.hold")}
            value={section.release.holdBeats}
            min={0}
            max={Math.min(16, section.lengthBeats - 4)}
            step={1}
            onCommit={(v) => edit({ op: "setRelease", sectionId: section.id, mode: section.release!.mode, holdBeats: v })}
          />
        </>
      )}
    </div>
  );
}
