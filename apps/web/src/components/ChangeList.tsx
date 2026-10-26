import type { FieldChange, PerformanceScore } from "@unperformed/performance-core";
import { describeChange, useI18n } from "../i18n";

export function ChangeList({ changes, score, limit }: { changes: FieldChange[]; score: PerformanceScore | null; limit?: number }) {
  const { locale, t } = useI18n();
  if (!changes.length) return <p className="muted small">{t("negotiate.noChanges")}</p>;
  const shown = limit ? changes.slice(0, limit) : changes;
  return (
    <ul className="changes">
      {shown.map((c) => {
        const d = describeChange(locale, c, score);
        return (
          <li key={c.path}>
            <span className="change-where">{d.where}</span>
            <span className="change-what">{d.what}</span>
            <span className="change-before">{d.before}</span>
            <span className="change-arrow" aria-hidden="true">→</span>
            <span className="change-after">{d.after}</span>
          </li>
        );
      })}
      {limit && changes.length > limit && <li className="muted small">+{changes.length - limit}</li>}
    </ul>
  );
}
