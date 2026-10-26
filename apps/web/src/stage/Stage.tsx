import { chooseRenderer, sample, type PerformanceScore, type SampleOptions, type StageFrame } from "@unperformed/performance-core";
import { useEffect, useRef, useState } from "react";
import { Canvas2DStage } from "./canvas2d";
import { webglAvailable } from "./detect";
import { AdaptiveQuality, QUALITY, qualityModeFromSearch, type Quality } from "./quality";
import type { StageRenderer } from "./types";

// three.js is most of the bundle's weight, and the first screens do not need it:
// load the WebGL stage on first use, once, and share it between stages.
let webglModule: Promise<typeof import("./webgl")> | null = null;
const loadWebGL = () => (webglModule ??= import("./webgl"));

export interface FrameStats {
  frames: number;
  avgFps: number;
  p95FrameMs: number;
  renderer: string;
  /** Render quality at the end of the measurement. */
  quality: Quality;
}

interface Props {
  score: PerformanceScore;
  /** Called every animation frame; returns the beat to draw. */
  beat: () => number;
  options?: SampleOptions;
  reducedMotion: boolean;
  onFrame?: (frame: StageFrame) => void;
  /** Collect frame timings (used by the performance view). */
  measure?: boolean;
  onStats?: (stats: FrameStats) => void;
  className?: string;
  label: string;
}

function qualityMode() {
  try {
    return qualityModeFromSearch(location.search);
  } catch {
    return "auto" as const;
  }
}

/** Once a stage on this page has had to reduce quality, later stages start reduced. */
let reducedThisPage = false;

function forceCanvas(): boolean {
  try {
    return new URLSearchParams(location.search).get("renderer") === "canvas";
  } catch {
    return false;
  }
}

/** The real-time stage. Rendering reads the score and the transport clock every frame; React does not re-render per frame. */
export function Stage({ score, beat, options, reducedMotion, onFrame, measure, onStats, className, label }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const veilRef = useRef<HTMLDivElement>(null);
  const live = useRef({ score, beat, options, reducedMotion, onFrame, onStats, measure });
  live.current = { score, beat, options, reducedMotion, onFrame, onStats, measure };
  const [rendererName, setRendererName] = useState<string>("");

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const caps = chooseRenderer({ webgl: webglAvailable(), forceCanvas: forceCanvas() });
    let r: StageRenderer | null = null;
    let disposed = false;
    let raf = 0;
    let ro: ResizeObserver | null = null;
    const times: number[] = [];
    const mode = qualityMode();
    const quality = new AdaptiveQuality(mode === "auto" && reducedThisPage ? "reduced" : mode);

    const start = (renderer: StageRenderer) => {
      r = renderer;
      setRendererName(renderer.name);
      wrap.dataset["renderer"] = renderer.name;
      const applyQuality = () => {
        renderer.setQuality(QUALITY[quality.level]);
        wrap.dataset["quality"] = quality.level;
      };
      applyQuality();
      const resize = () => {
        const rect = wrap.getBoundingClientRect();
        renderer.resize(Math.max(1, rect.width), Math.max(1, rect.height), window.devicePixelRatio || 1);
      };
      resize();
      ro = new ResizeObserver(resize);
      ro.observe(wrap);

      let last = performance.now();
      let statTick = 0;
      const loop = () => {
        const t = performance.now();
        const L = live.current;
        if (quality.push(t - last)) {
          reducedThisPage = true;
          applyQuality();
          resize();
        }
        const frame = sample(L.score, L.beat(), L.options);
        renderer.render(frame, L.score.seed, L.reducedMotion);
        if (veilRef.current) veilRef.current.style.opacity = String(frame.blackout);
        L.onFrame?.(frame);
        if (L.measure) {
          times.push(t - last);
          if (++statTick % 30 === 0 && L.onStats) L.onStats(stats(times, renderer.name, quality.level));
        }
        last = t;
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    };

    if (caps.name === "webgl") {
      loadWebGL()
        .then(({ WebGLStage }) => {
          if (disposed) return;
          try {
            start(new WebGLStage(canvas));
          } catch {
            start(new Canvas2DStage(canvas));
          }
        })
        .catch(() => {
          if (!disposed) start(new Canvas2DStage(canvas));
        });
    } else {
      start(new Canvas2DStage(canvas));
    }

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro?.disconnect();
      if (!r) return;
      if (live.current.measure && live.current.onStats && times.length) live.current.onStats(stats(times, r.name, quality.level));
      r.dispose();
    };
  }, []);

  return (
    <div ref={wrapRef} className={`stage ${className ?? ""}`} role="img" aria-label={label} data-renderer={rendererName}>
      <canvas ref={canvasRef} />
      <div ref={veilRef} className="stage-veil" aria-hidden="true" />
    </div>
  );
}

function stats(times: number[], renderer: string, quality: Quality): FrameStats {
  const t = times.slice(1).filter((x) => x > 0 && x < 1000);
  if (!t.length) return { frames: 0, avgFps: 0, p95FrameMs: 0, renderer, quality };
  const avg = t.reduce((a, b) => a + b, 0) / t.length;
  const sorted = [...t].sort((a, b) => a - b);
  return { frames: t.length, avgFps: Math.round(1000 / avg), p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)]! * 10) / 10, renderer, quality };
}
