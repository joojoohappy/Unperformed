import { useEffect, useState } from "react";

/** A range input that previews locally and commits once, when the person lets go. */
export function CommitRange(props: { label: string; value: number; min: number; max: number; step: number; onCommit: (v: number) => void; format?: (v: number) => string; testId?: string }) {
  const { value, onCommit } = props;
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v !== value) onCommit(v);
  };
  return (
    <label className="field range">
      <span className="label">
        {props.label} <span className="mono">{props.format ? props.format(v) : v}</span>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step}
        value={v}
        data-testid={props.testId}
        onChange={(e) => setV(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </label>
  );
}
