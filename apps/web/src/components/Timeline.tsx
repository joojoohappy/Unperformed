import { sample, type PerformanceScore } from "@unperformed/performance-core";
import { useMemo, useRef, type PointerEvent } from "react";

interface Props {
  score: PerformanceScore;
  selected?: string | null;
  onSelect?: (sectionId: string) => void;
  /** Beat of the playhead, or null to hide it. */
  playhead?: number | null;
  onSeek?: (beat: number) => void;
  compact?: boolean;
  label: string;
}

const W = 1000;

/** The score as a strip: sections, the energy arc, the climax hold, and a playhead. */
export function Timeline({ score, selected, onSelect, playhead, onSeek, compact, label }: Props) {
  const H = compact ? 64 : 120;
  const ref = useRef<SVGSVGElement>(null);
  const curve = useMemo(() => {
    const pts: string[] = [];
    const n = 160;
    for (let i = 0; i <= n; i++) {
      const b = (i / n) * score.totalBeats;
      const f = sample(score, b);
      pts.push(`${((b / score.totalBeats) * W).toFixed(1)},${(H - 8 - f.energy * (H - 30)).toFixed(1)}`);
    }
    return pts.join(" ");
  }, [score, H]);

  const toBeat = (e: PointerEvent<SVGSVGElement>) => {
    const rect = ref.current!.getBoundingClientRect();
    return Math.max(0, Math.min(score.totalBeats - 0.01, ((e.clientX - rect.left) / rect.width) * score.totalBeats));
  };

  return (
    <svg
      ref={ref}
      className={`timeline ${onSeek ? "is-seekable" : ""}`}
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      role="group"
      aria-label={label}
      onPointerDown={(e) => {
        if (!onSeek) return;
        (e.target as Element).setPointerCapture?.(e.pointerId);
        onSeek(toBeat(e));
      }}
      onPointerMove={(e) => {
        if (onSeek && e.buttons === 1) onSeek(toBeat(e));
      }}
    >
      {score.sections.map((s) => {
        const x = (s.startBeat / score.totalBeats) * W;
        const w = (s.lengthBeats / score.totalBeats) * W;
        const isSel = selected === s.id;
        const hold = s.release && s.release.mode !== "immediate" ? (s.release.holdBeats / score.totalBeats) * W : 0;
        return (
          <g key={s.id} className={`tl-section ${isSel ? "is-selected" : ""}`}>
            <rect x={x} y={0} width={w} height={H} fill={s.lighting.key} opacity={isSel ? 0.22 : 0.08} />
            {hold > 0 && <rect x={x} y={0} width={hold} height={H} className="tl-hold" />}
            <line x1={x} x2={x} y1={0} y2={H} className="tl-divider" />
            {onSelect && (
              <rect
                x={x}
                y={0}
                width={w}
                height={H}
                fill="transparent"
                tabIndex={0}
                role="button"
                aria-pressed={isSel}
                aria-label={s.name}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  onSelect(s.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelect(s.id);
                  }
                }}
              />
            )}
          </g>
        );
      })}
      <polyline points={curve} className="tl-curve" />
      {playhead != null && <line x1={(playhead / score.totalBeats) * W} x2={(playhead / score.totalBeats) * W} y1={0} y2={H} className="tl-playhead" />}
    </svg>
  );
}

/** Section names under a timeline, aligned to the strip. */
export function TimelineLabels({ score, selected }: { score: PerformanceScore; selected?: string | null }) {
  return (
    <div className="tl-labels" aria-hidden="true">
      {score.sections.map((s) => (
        <span key={s.id} style={{ flexGrow: s.lengthBeats }} className={selected === s.id ? "is-selected" : ""}>
          {s.name}
        </span>
      ))}
    </div>
  );
}
