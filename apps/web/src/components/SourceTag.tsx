import type { Source } from "@unperformed/performance-core";
import { useI18n } from "../i18n";

/** Always says where a piece of content came from: demo rules, a named model, or a fallback. */
export function SourceTag({ source }: { source: Source }) {
  const { t } = useI18n();
  const text =
    source.kind === "llm" ? t("source.llm", { model: source.model }) : source.kind === "rules" ? t("source.rules") : t("source.rules-fallback", { reason: source.reason });
  return <span className={`source source-${source.kind}`}>{text}</span>;
}
