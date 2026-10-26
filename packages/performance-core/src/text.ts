/**
 * Localizable text. Rule-generated messages carry an i18n key plus params so
 * the UI can render them in English or Traditional Chinese. Text written by a
 * language model is stored verbatim as a literal (in the locale it was asked for).
 */
export type Text =
  | { key: string; params?: Record<string, string | number> }
  | { literal: string };

export const t = (key: string, params?: Record<string, string | number>): Text => (params ? { key, params } : { key });
export const literal = (s: string): Text => ({ literal: s });
