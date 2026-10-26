/**
 * Stage set: which set pieces stand on the stage for this idea, and how much
 * of each. Chosen when the idea is interpreted (by the model in Live AI, by
 * the keyword rules in demo mode); the renderer builds the set from a fixed
 * kit of procedural pieces, and the section types decide how each piece moves,
 * breaks and disappears. A richer description gives a fuller set.
 */
import { z } from "zod";
import { clamp } from "./util";

export const PROP_KINDS = [
  /** Tall crystal pillars in rows on both sides. */
  "pillars",
  /** A black monolith on a stepped plinth at the back. */
  "monolith",
  /** A ring of light hanging above the stage. */
  "ring",
  /** Vertical beams of light from above. */
  "beam",
  /** Curtains of thin vertical light strings. */
  "strings",
  /** Fans of laser lines from the back. */
  "lasers",
  /** LED screen panels across the back wall. */
  "screens",
  /** The idea's own words, projected. */
  "words",
  /** Crystal shards that lift, fly and fall. */
  "shards",
  /** Low fog across the floor. */
  "haze"
] as const;
export const FLOORS = ["mirror", "matte", "water"] as const;

export const PropKind = z.enum(PROP_KINDS);
export const Floor = z.enum(FLOORS);
export const SetPiece = z.object({ kind: PropKind, amount: z.number().min(0).max(1) }).strict();
export const StageSet = z
  .object({ pieces: z.array(SetPiece).min(1).max(PROP_KINDS.length), floor: Floor })
  .strict()
  .superRefine((set, ctx) => {
    const seen = new Set<string>();
    set.pieces.forEach((p, i) => {
      if (seen.has(p.kind)) ctx.addIssue({ code: "custom", path: ["pieces", i, "kind"], message: `duplicate set piece ${p.kind}` });
      seen.add(p.kind);
    });
  });

export type PropKind = z.infer<typeof PropKind>;
export type Floor = z.infer<typeof Floor>;
export type SetPiece = z.infer<typeof SetPiece>;
export type StageSet = z.infer<typeof StageSet>;

/** Words that ask for a set piece by name, in English and Traditional Chinese. */
const PROP_CUES: Record<PropKind, RegExp> = {
  pillars: /\b(pillars?|columns?|temple|cathedral|hall|colonnade|monument\w*)\b|柱|神殿|殿堂|聖殿|教堂|廊/i,
  monolith: /\b(door|doors|gate|monolith|altar|throne|stairs?|steps)\b|門|石碑|祭壇|王座|階梯|台階|巨石/i,
  ring: /\b(ring|halo|circle|orbit|moon|eclipse|crown)\b|環|光圈|圓|月|日蝕|王冠|軌道/i,
  beam: /\b(beams?|spotlight|ray|rays|shaft|light|lights|dawn|sun)\b|光束|聚光|光|日出|太陽|黎明/i,
  strings: /\b(rain|threads?|strings?|lines?|curtain|veil|waterfall)\b|雨|絲|線|簾|瀑布|紗/i,
  lasers: /\b(lasers?|concert|idol|k-?pop|club|rave|festival|dance)\b|雷射|演唱會|偶像|舞曲|夜店|派對|跳舞|音樂祭/i,
  screens: /\b(screens?|led|video|monitors?|digital|signal|data|glitch)\b|螢幕|屏幕|影像|數位|訊號|資料|故障/i,
  words: /\b(words?|text|letters?|poem|poetry|language|names?|writing|voice)\b|文字|字|詩|語言|名字|書寫|句/i,
  shards: /\b(shard\w*|glass|crystal\w*|shatter\w*|break(?!s?\s+through)\w*|broke|fragment\w*|explo\w*|collapse\w*)\b|碎|玻璃|水晶|爆|崩|裂|瓦解/i,
  haze: /\b(fog|mist|smoke|haze|cloud\w*|dust|breath)\b|霧|煙|雲|塵|呼吸/i
};
const FLOOR_CUES: [Floor, RegExp][] = [
  ["water", /\b(water|sea|ocean|lake|tide|flood|river|wave\w*)\b|水(?!晶)|海|湖|潮|河|浪/i],
  ["matte", /\b(desert|earth|ground|stone|ash|sand)\b|沙漠|大地|泥土|岩石|石頭|灰燼|沙/i]
];

/** Pieces a stage always has something of, so even a short idea gets a set. */
const BASE: PropKind[] = ["beam", "haze"];

/**
 * Demo rules: pieces named or implied by the idea, sized by how much the idea
 * describes. `implied` pieces (from the idea's arc) only fill in a sparse
 * description: once the idea names three or more pieces, the stage is built
 * from what it names. Deterministic; reports which pieces it found so the
 * person can see why the stage looks the way it does.
 */
export function demoSet(intent: string, implied: PropKind[] = []): { set: StageSet; named: PropKind[] } {
  const named = PROP_KINDS.filter((k) => PROP_CUES[k].test(intent));
  const sparse = named.filter((k) => !BASE.includes(k)).length < 3;
  const kinds = [...new Set<PropKind>([...BASE, ...(sparse ? implied : []), ...named])];
  // Richer descriptions fill the stage more: length and the number of things named both count.
  // A CJK character carries about as much as a short English word, so it counts three times.
  const length = [...intent.trim()].reduce((n, c) => n + (c.codePointAt(0)! >= 0x2e80 ? 3 : 1), 0);
  const richness = clamp(0.3 + length / 400 + named.length * 0.08, 0.3, 1);
  const pieces = PROP_KINDS.filter((k) => kinds.includes(k)).map((kind) => ({
    kind,
    amount: Math.round((named.includes(kind) ? Math.min(1, richness + 0.15) : richness * 0.75) * 100) / 100
  }));
  const floor = FLOOR_CUES.find(([, re]) => re.test(intent))?.[0] ?? "mirror";
  return { set: { pieces, floor }, named };
}

/** A set for scores made before stage sets existed: a quiet hall with a beam. */
export const DEFAULT_SET: StageSet = {
  pieces: [
    { kind: "pillars", amount: 0.5 },
    { kind: "monolith", amount: 0.5 },
    { kind: "beam", amount: 0.5 },
    { kind: "strings", amount: 0.4 },
    { kind: "shards", amount: 0.4 },
    { kind: "haze", amount: 0.4 }
  ],
  floor: "mirror"
};

export function setAmount(set: StageSet, kind: PropKind): number {
  return set.pieces.find((p) => p.kind === kind)?.amount ?? 0;
}
