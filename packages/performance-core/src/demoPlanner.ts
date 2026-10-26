/**
 * Demo-mode planner. NOT an AI model.
 *
 * A transparent keyword-and-template planner that turns an idea into an
 * Interpretation without any network access. It exists so the full workflow
 * can be evaluated offline and reproducibly. It recognises a fixed set of
 * cues (English and Traditional Chinese) and reports exactly which ones it
 * matched, so nobody mistakes it for language understanding.
 */
import type { Interpretation, InterpretedPhase } from "./interpretation";
import type { Mood } from "./schema";

export type Locale = "en" | "zh-TW";

type Cue = "order" | "chaos" | "silence" | "climax" | "light" | "dark" | "tender" | "rage" | "water";

const LEXICON: Record<Cue, RegExp> = {
  order: /\b(order|ordered|perfect|symmetr\w*|grid|calm|still(ness)?|precise|discipline\w*)\b|秩序|完美|整齊|對稱|平靜|規律|精準/i,
  chaos: /\b(chaos|chaotic|collapse\w*|break\w*|broke|shatter\w*|storm|fall\w*|disorder|crumbl\w*|unravel\w*)\b|混亂|崩|瓦解|破碎|碎裂|失序|失控|坍塌|風暴/i,
  silence: /\b(silen\w*|quiet|nothing(ness)?|void|empty|stillness at the end|hush)\b|寂靜|安靜|沉默|靜默|無聲|虛無|靜止|空無/i,
  climax: /\b(explo\w*|burst|peak|climax|erupt\w*|release)\b|爆|炸|高潮|噴發|釋放|頂點/i,
  light: /\b(light|dawn|sunrise|hope|bloom\w*|rise|rising|glow)\b|光|黎明|日出|破曉|希望|綻放|升起/i,
  dark: /\b(dark\w*|night|shadow\w*|black|abyss)\b|黑暗|暗|夜|陰影|深淵/i,
  tender: /\b(tender|love|gentle|soft|heart|warm)\b|溫柔|愛|柔軟|心|溫暖/i,
  rage: /\b(anger|angry|rage|defian\w*|resist\w*|fight)\b|憤怒|反抗|抵抗|怒|不屈/i,
  water: /\b(water|sea|ocean|rain|tide|flow\w*|wave\w*)\b|水|海|雨|潮|河|流動|浪/i
};

const CUE_LABEL: Record<Locale, Record<Cue, string>> = {
  en: { order: "order", chaos: "collapse", silence: "silence", climax: "climax", light: "light", dark: "darkness", tender: "tenderness", rage: "defiance", water: "flow" },
  "zh-TW": { order: "秩序", chaos: "崩解", silence: "寂靜", climax: "高潮", light: "光", dark: "黑暗", tender: "溫柔", rage: "反抗", water: "流動" }
};

const PALETTES: Record<Mood, Interpretation["palette"]> = {
  serene: { base: "#9fb7d9", accent: "#e8e2d4", climax: "#ffffff" },
  tense: { base: "#c9d3e0", accent: "#e0573a", climax: "#ff3b1f" },
  melancholic: { base: "#6f87b0", accent: "#c9b8a6", climax: "#eef1f6" },
  euphoric: { base: "#f2b25c", accent: "#ff6f61", climax: "#fff2c7" },
  ominous: { base: "#7a8a99", accent: "#a3322a", climax: "#ff2a1a" },
  tender: { base: "#e9b8a3", accent: "#f6e7d8", climax: "#ffd9c2" },
  defiant: { base: "#d8d8d8", accent: "#ff3d00", climax: "#ffe600" }
};

const L = {
  en: {
    phase: {
      order: "Order",
      tremor: "Tremor",
      fracture: "Fracture",
      collapse: "Collapse",
      silence: "Silence",
      dark: "Night",
      gather: "Gathering",
      rise: "Rise",
      afterglow: "Afterglow",
      drift: "Drift",
      surge: "Surge",
      ebb: "Ebb"
    },
    notes: {
      order: "A perfect grid, held still. Cold light, a single slow pulse.",
      tremor: "The grid begins to breathe out of time.",
      fracture: "Alignment fails; shards separate, the pulse doubles.",
      collapse: "Everything lets go at once.",
      silence: "Light drains away. No sound.",
      dark: "A low drone in near darkness.",
      gather: "Small lights find each other.",
      rise: "The light breaks through.",
      afterglow: "What remains, slowly cooling.",
      drift: "Loose particles drift without direction.",
      surge: "A swell that keeps building.",
      ebb: "The wave recedes."
    },
    titles: { collapse: "Order, Undone", dawn: "Before Light", flow: "Tide Study", generic: "Untitled Rise" },
    summary: {
      collapse: "A study in loss of control: a perfectly ordered stage slowly fails, breaks open at the climax, and ends in silence.",
      dawn: "Out of darkness, light gathers until it breaks through, then settles into an afterglow.",
      flow: "A tidal piece: drifting, surging, and receding.",
      generic: "A single arc from stillness to a peak and back down."
    },
    understood: {
      arc: (a: string) => `Arc: ${a}.`,
      cues: (c: string) => `Matched cues (demo rules): ${c}.`,
      none: "No known cues matched; using the default arc (demo rules).",
      mood: (m: string) => `Mood read as: ${m}.`,
      constraint: (c: string) => `Proposed constraint: ${c}`
    },
    constraints: { "ending-silence": "End in complete silence.", "opening-order": "Open in perfect order." },
    strategy: "Earn the climax through contrast: keep restraint before the release so the peak lands as a change, not more of the same.",
    arrow: " → "
  },
  "zh-TW": {
    phase: {
      order: "秩序",
      tremor: "顫動",
      fracture: "斷裂",
      collapse: "崩落",
      silence: "寂靜",
      dark: "夜",
      gather: "聚集",
      rise: "升起",
      afterglow: "餘光",
      drift: "漂移",
      surge: "湧動",
      ebb: "退潮"
    },
    notes: {
      order: "完美的格線，靜止不動。冷光，一個緩慢的脈動。",
      tremor: "格線開始呼吸，卻不再合拍。",
      fracture: "對齊失效，碎片分離，脈動加倍。",
      collapse: "一切同時鬆手。",
      silence: "光慢慢退去，沒有聲音。",
      dark: "幾近全暗中的一道低鳴。",
      gather: "微小的光彼此靠近。",
      rise: "光穿透而出。",
      afterglow: "留下來的，慢慢冷卻。",
      drift: "鬆散的粒子沒有方向地漂移。",
      surge: "持續累積的湧浪。",
      ebb: "浪潮退去。"
    },
    titles: { collapse: "秩序，崩解", dawn: "光之前", flow: "潮汐習作", generic: "無題的升起" },
    summary: {
      collapse: "一則關於失控的習作：完美有序的舞台逐漸失靈，在高潮處崩開，最後歸於寂靜。",
      dawn: "從黑暗中，光逐漸聚集直到穿透，最後沉澱為餘光。",
      flow: "一件潮汐之作：漂移、湧動、退去。",
      generic: "一道從靜止升到高峰、再回落的弧線。"
    },
    understood: {
      arc: (a: string) => `結構：${a}。`,
      cues: (c: string) => `比對到的線索（示範規則）：${c}。`,
      none: "沒有比對到已知線索，使用預設弧線（示範規則）。",
      mood: (m: string) => `判讀出的情緒：${m}。`,
      constraint: (c: string) => `建議的限制條件：${c}`
    },
    constraints: { "ending-silence": "以完全的寂靜結束。", "opening-order": "以完美的秩序開場。" },
    strategy: "用對比贏得高潮：釋放之前保持克制，讓高峰成為一次轉變，而不只是同樣的東西再多一點。",
    arrow: " → "
  }
} as const;

const MOOD_LABEL: Record<Locale, Record<Mood, string>> = {
  en: { serene: "serene", tense: "tense", melancholic: "melancholic", euphoric: "euphoric", ominous: "ominous", tender: "tender", defiant: "defiant" },
  "zh-TW": { serene: "寧靜", tense: "緊繃", melancholic: "憂鬱", euphoric: "狂喜", ominous: "不祥", tender: "溫柔", defiant: "反抗" }
};

export function matchCues(text: string): Cue[] {
  return (Object.keys(LEXICON) as Cue[]).filter((c) => LEXICON[c].test(text));
}

type ArcKind = "collapse" | "dawn" | "flow" | "generic";

function phase(
  name: string,
  archetype: InterpretedPhase["archetype"],
  weight: number,
  energyFrom: number,
  energyTo: number,
  geometry: InterpretedPhase["geometry"],
  sound: InterpretedPhase["sound"],
  note: string
): InterpretedPhase {
  return { name, archetype, weight, energyFrom, energyTo, geometry, sound, note };
}

export interface DemoPlanInput {
  intent: string;
  mood?: Mood | null;
  locale: Locale;
}

export function demoInterpret({ intent, mood: moodHint, locale }: DemoPlanInput): Interpretation {
  const S = L[locale];
  const cues = matchCues(intent);
  const has = (c: Cue) => cues.includes(c);

  let arc: ArcKind = "generic";
  if (has("order") || has("chaos")) arc = "collapse";
  else if (has("light") || has("dark")) arc = "dawn";
  else if (has("water")) arc = "flow";

  const endsSilent = has("silence") || arc === "collapse";
  const P = S.phase;
  const N = S.notes;
  let phases: InterpretedPhase[];
  switch (arc) {
    case "collapse":
      phases = [
        phase(P.order, "order", 3, 0.15, 0.25, "grid", "pulse", N.order),
        phase(P.tremor, "build", 2, 0.3, 0.6, "lattice", "drone", N.tremor),
        phase(P.fracture, "fracture", 2, 0.6, 0.85, "shards", "noise", N.fracture),
        phase(P.collapse, "climax", 2, 0.9, 0.7, "dust", "swell", N.collapse),
        endsSilent
          ? phase(P.silence, "silence", 2, 0.2, 0, "void", "silence", N.silence)
          : phase(P.afterglow, "release", 2, 0.4, 0.1, "dust", "drone", N.afterglow)
      ];
      break;
    case "dawn":
      phases = [
        phase(P.dark, "drift", 2, 0.1, 0.2, "dust", "drone", N.dark),
        phase(P.gather, "build", 3, 0.25, 0.7, "ring", "pulse", N.gather),
        phase(P.rise, "climax", 2, 0.85, 0.8, "monolith", "swell", N.rise),
        endsSilent
          ? phase(P.silence, "silence", 2, 0.2, 0, "void", "silence", N.silence)
          : phase(P.afterglow, "release", 2, 0.5, 0.15, "ring", "drone", N.afterglow)
      ];
      break;
    case "flow":
      phases = [
        phase(P.drift, "drift", 2, 0.15, 0.3, "dust", "drone", N.drift),
        phase(P.surge, "build", 3, 0.35, 0.75, "ring", "pulse", N.surge),
        phase(P.collapse, "climax", 2, 0.85, 0.7, "shards", "swell", N.collapse),
        phase(P.ebb, "release", 2, 0.5, 0.1, "dust", "drone", N.ebb)
      ];
      if (endsSilent) phases.push(phase(P.silence, "silence", 1, 0.1, 0, "void", "silence", N.silence));
      break;
    default:
      phases = [
        phase(P.drift, "drift", 2, 0.1, 0.25, "grid", "drone", N.drift),
        phase(P.surge, "build", 3, 0.3, 0.75, "ring", "pulse", N.surge),
        phase(P.rise, "climax", 2, 0.85, 0.75, "monolith", "swell", N.rise),
        phase(P.ebb, "release", 2, 0.5, 0.1, "dust", "drone", N.ebb)
      ];
      if (endsSilent) phases.push(phase(P.silence, "silence", 1, 0.1, 0, "void", "silence", N.silence));
  }

  let mood: Mood = moodHint ?? "serene";
  if (!moodHint) {
    if (has("rage")) mood = "defiant";
    else if (arc === "collapse") mood = "tense";
    else if (has("tender")) mood = "tender";
    else if (arc === "dawn") mood = has("dark") ? "melancholic" : "euphoric";
    else if (has("dark")) mood = "ominous";
  }

  const constraints: Interpretation["constraints"] = [];
  if (endsSilent) constraints.push({ kind: "ending-silence", text: S.constraints["ending-silence"] });
  if (has("order") && arc === "collapse") constraints.push({ kind: "opening-order", text: S.constraints["opening-order"] });

  const climaxIndex = phases.findIndex((p) => p.archetype === "climax");
  const understood = [
    S.understood.arc(phases.map((p) => p.name).join(S.arrow)),
    cues.length ? S.understood.cues(cues.map((c) => CUE_LABEL[locale][c]).join(locale === "en" ? ", " : "、")) : S.understood.none,
    S.understood.mood(MOOD_LABEL[locale][mood]),
    ...constraints.map((c) => S.understood.constraint(c.text))
  ].slice(0, 5);

  return {
    title: S.titles[arc],
    summary: S.summary[arc],
    understood,
    mood,
    palette: PALETTES[mood],
    tempoBpm: arc === "collapse" ? 120 : arc === "flow" ? 96 : 108,
    phases,
    climax: climaxIndex >= 0 ? { phaseIndex: climaxIndex, release: "staggered", holdBeats: 4 } : null,
    constraints,
    strategy: S.strategy
  };
}

export const EXAMPLE_INTENTS: Record<Locale, string[]> = {
  en: [
    "I want a performance that starts with perfect order, gradually collapses into chaos, and ends in complete silence.",
    "Out of total darkness, light slowly gathers until it breaks through.",
    "A tide that drifts, surges, and pulls away, leaving nothing behind."
  ],
  "zh-TW": [
    "我想要一場從完美秩序開始、逐漸崩解成混亂、最後歸於完全寂靜的演出。",
    "從徹底的黑暗中，光慢慢聚集，直到穿透而出。",
    "一道潮汐：漂移、湧動、退去，最後什麼也不留下。"
  ]
};
