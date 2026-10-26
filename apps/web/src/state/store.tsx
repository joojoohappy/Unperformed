import { initialSession, reduce, type Action, type Locale, type Mode, type SessionState } from "@unperformed/performance-core";
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react";

const SESSION_KEY = "unperformed.session.v1";
const PREFS_KEY = "unperformed.prefs.v1";

export interface Prefs {
  reducedMotion: boolean;
  sound: boolean;
}

export const newId = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

function safeRead<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage may be unavailable (private mode); the session still works in memory */
  }
}

function detectLocale(): Locale {
  const url = new URLSearchParams(location.search).get("lang");
  if (url === "zh-TW" || url === "en") return url;
  return "en";
}

function loadSession(): SessionState {
  const saved = safeRead<SessionState>(SESSION_KEY);
  const lang = new URLSearchParams(location.search).get("lang");
  if (saved && saved.version === 1 && Array.isArray(saved.events)) {
    return lang === "zh-TW" || lang === "en" ? { ...saved, locale: lang } : saved;
  }
  return initialSession(newId(), Date.now(), detectLocale(), "demo");
}

function loadPrefs(): Prefs {
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  return { reducedMotion: reduce, sound: true, ...(safeRead<Partial<Prefs>>(PREFS_KEY) ?? {}) };
}

export interface LiveStatus {
  checked: boolean;
  available: boolean;
  model: string | null;
}

interface Store {
  state: SessionState;
  dispatch: (a: Action) => void;
  prefs: Prefs;
  setPrefs: (p: Partial<Prefs>) => void;
  live: LiveStatus;
  setLive: (l: LiveStatus) => void;
  reset: (mode?: Mode) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reduce, undefined, loadSession);
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [live, setLive] = useState<LiveStatus>({ checked: false, available: false, model: null });

  useEffect(() => safeWrite(SESSION_KEY, state), [state]);
  useEffect(() => safeWrite(PREFS_KEY, prefs), [prefs]);
  useEffect(() => {
    document.documentElement.lang = state.locale;
  }, [state.locale]);

  const setPrefs = useCallback((p: Partial<Prefs>) => setPrefsState((x) => ({ ...x, ...p })), []);
  const reset = useCallback(
    (mode?: Mode) => dispatch({ type: "reset", at: Date.now(), id: newId(), locale: state.locale, mode: mode ?? state.mode }),
    [state.locale, state.mode]
  );

  const value = useMemo(() => ({ state, dispatch, prefs, setPrefs, live, setLive, reset }), [state, prefs, setPrefs, live, reset]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStore outside provider");
  return v;
}
