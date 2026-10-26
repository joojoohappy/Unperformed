import type { FieldChange, Locale, PerformanceScore, Text } from "@unperformed/performance-core";
import { createContext, useContext, useMemo, type ReactNode } from "react";
import { en, type MessageKey } from "./en";
import { zhTW } from "./zh-TW";

const TABLES: Record<Locale, Record<string, string>> = { en, "zh-TW": zhTW };

/** Format a message. Params whose value names an enum ("held", "orbit"…) are translated too. */
export function format(locale: Locale, key: string, params?: Record<string, string | number>): string {
  const table = TABLES[locale];
  const template = table[key] ?? TABLES.en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const v = params[name];
    if (v === undefined) return `{${name}}`;
    if (typeof v === "string") return table[`enum.${v}`] ?? v;
    return String(v);
  });
}

export function renderText(locale: Locale, text: Text): string {
  return "literal" in text ? text.literal : format(locale, text.key, text.params);
}

function formatValue(locale: Locale, v: unknown): string {
  if (v === undefined || v === null) return format(locale, "value.removed");
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : v.toFixed(2);
  if (typeof v === "string") return TABLES[locale][`enum.${v}`] ?? v;
  if (typeof v === "object" && v && "mode" in v) {
    const r = v as { mode: string; holdBeats: number };
    return `${formatValue(locale, r.mode)}${r.holdBeats ? ` · ${r.holdBeats}` : ""}`;
  }
  return JSON.stringify(v);
}

/** "s4.release.mode" -> { where: "Collapse", what: "release", before, after } */
export function describeChange(locale: Locale, change: FieldChange, score: PerformanceScore | null) {
  const [head, ...rest] = change.path.split(".");
  const field = rest.join(".");
  const section = score?.sections.find((s) => s.id === head);
  let where = section?.name ?? head ?? "";
  let what = format(locale, `field.${field}`);
  if (head === "palette") {
    where = "";
    what = format(locale, `field.palette.${field}`);
  } else if (head === "tempoBpm") {
    where = "";
    what = format(locale, "field.tempo");
  } else if (head === "constraints") {
    where = "";
    what = format(locale, "field.constraint");
  }
  return { where, what, before: formatValue(locale, change.before), after: formatValue(locale, change.after) };
}

interface I18n {
  locale: Locale;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  tx: (text: Text) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const value = useMemo<I18n>(
    () => ({ locale, t: (key, params) => format(locale, key, params), tx: (text) => renderText(locale, text) }),
    [locale]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useI18n(): I18n {
  const v = useContext(Ctx);
  if (!v) throw new Error("useI18n outside provider");
  return v;
}

export { en, zhTW };
export type { MessageKey };
