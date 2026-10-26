# Performance Score

[English](../en/performance-score.md)

Performance Score 是創作流程與即時引擎之間唯一的契約。它以 zod 定義於 [`packages/performance-core/src/schema.ts`](../../packages/performance-core/src/schema.ts)，並匯出為 JSON Schema：[`docs/schema/performance-score.schema.json`](../schema/performance-score.schema.json)（以 `pnpm --filter @unperformed/performance-core schema` 重新產生）。

Score 中沒有任何可執行的內容。每個欄位都是列舉值或有界的數字，因此模型可以提議修改 score，但永遠無法把行為注入渲染器或音訊引擎。

## 刻意設計的兩份契約

| | Interpretation | Performance Score |
| --- | --- | --- |
| 撰寫者 | 規劃者：示範規則或模型 | 確定性編譯器，之後再由 patch 修改 |
| 內容 | 創作意圖：階段、情緒、高潮、提議的限制條件、策略 | 舞台所需的一切：時間、能量、燈光、鏡頭、幾何、聲音 |
| 大小 | 小（3–6 個階段、短字串） | 完整 |
| 驗證 | `.strict()`，拒絕未知欄位 | 欄位範圍加上跨欄位規則 |

模型擅長左欄，在右欄（拍數計算、一致的數值範圍）則不可靠。讓模型的輸出保持小而偏創意，再用程式碼編譯，Live AI 與示範模式產生的 score 就有相同的保證。

## Score

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `schemaVersion` | `1` | 有破壞性變更時遞增。 |
| `title`、`summary` | string | 分別 ≤ 80 與 ≤ 400 字元。 |
| `mood` | 列舉 | `serene`、`tense`、`melancholic`、`euphoric`、`ominous`、`tender`、`defiant`。 |
| `tempoBpm` | 整數 60–160 | 所有地方都以 beat 作為時間單位。 |
| `rootNote` | MIDI 36–60 | 程序化音訊以它為中心調音。 |
| `seed` | 整數 | 讓佈局與噪音可重現。由構想文字推導。 |
| `totalBeats` | 整數 16–512 | 等於所有段落長度的總和。 |
| `palette` | `{ base, accent, climax }` | `#rrggbb`。 |
| `sections` | 2–8 個 `Section` | 連續且依序排列。 |
| `constraints` | ≤ 12 個 `Constraint` | 見下文。 |
| `humanLocked` | string[] | 由人設定的欄位路徑，例如 `s3.camera.move`。AI 不得修改。 |
| `set` | `StageSet`，選填 | 這個構想的舞台道具。舞台設計出現之前做的 score 會使用預設道具組。見下方。 |

## Section（段落）

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `id` | `s<n>` | 不可重複。 |
| `name` | string | 由舞台元素拼出，並顯示在字幕、HUD 與時間軸上。 |
| `note` | string，選填 | 最多 160 字：這一段發生什麼，來自解讀。顯示為舞台字幕。 |
| `archetype` | 列舉 | `order`、`build`、`fracture`、`climax`、`release`、`silence`、`drift`。 |
| `startBeat`、`lengthBeats` | 整數 | `startBeat` 必須等於前一段的結尾。長度 4–256。 |
| `energy` | `{ from, to, curve }` | 0–1。曲線：`linear`、`ease-in`、`ease-out`、`step`。 |
| `lighting` | `{ key, accent, intensity, wash, flicker }` | 色調：`cold`、`neutral`、`warm`。閃爍 0–1 表示幅度，其頻率由引擎限制在 2 Hz。 |
| `camera` | `{ move, speed }` | `static`、`push-in`、`pull-back`、`orbit`、`drift`、`tremor`。 |
| `geometry` | `{ form, order, density }` | 形態：`grid`、`lattice`、`shards`、`ring`、`dust`、`void`、`monolith`。秩序 1 代表完美對齊。 |
| `sound` | `{ texture, level, pulseEvery, pitch }` | 質地：`drone`、`pulse`、`noise`、`swell`、`silence`。音高以半音計，±12。 |
| `transition` | `{ type, beats }` | 進入此段的轉場：`cut`、`fade`、`dissolve`、`blackout`；0–8 拍。 |
| `release` | `{ mode, holdBeats }`，選填 | 只能用於 `climax` 段落。`immediate`、`held`（先等待再釋放）或 `staggered`。`holdBeats` 必須短於段落長度。 |

## Constraint（限制條件）

| 欄位 | 說明 |
| --- | --- |
| `id`、`kind`、`text` | 種類：`ending-silence`、`opening-order`、`no-strobe`、`max-energy`、`keep-climax`。`text` 使用人撰寫時的語言。 |
| `value` | 選填的 0–1 參數（`max-energy` 的上限）。 |
| `status` | 人核准前為 `proposed`；只有 `approved` 的限制條件會被執行。 |
| `owner` | 永遠是 `human`。 |

## 跨欄位規則

在 `superRefine` 中檢查，並由 `test/schema.test.ts` 覆蓋：

- 段落從第 0 拍開始連續排列，總和等於 `totalBeats`；
- 段落 id 不重複；
- `release` 只出現在高潮段落，且壓抑拍數短於段落長度；
- 限制條件 id 不重複。

## Stage set（舞台設計）

`stageSet.ts`。舞台上放哪些道具、每種放多少。舞台用一套固定的程序化道具組把它們做出來；段落類型決定道具怎麼動、怎麼碎裂、怎麼消失。

| 欄位 | 型別 | 說明 |
| --- | --- | --- |
| `pieces` | 1–10 個 `{ kind, amount }` | kind 不可重複。`amount` 0–1：數值越大，柱子、碎片、光絲、雷射發射器或螢幕面板越多，石碑或光環越大，光束越多（1、3 或 5 道）。 |
| `floor` | enum | `mirror`（鏡面）、`water`（水面，倒影較暗較柔）、`matte`（霧面，沒有倒影）。 |

道具種類：`pillars`（成排的水晶柱）、`monolith`（台階上的黑色石碑）、`ring`（懸在上方的光環）、`beam`（從上方打下的光束）、`strings`（細光絲組成的簾幕）、`lasers`（扇形雷射）、`screens`（後牆的 LED 面板）、`words`（用光點拼出的段落名稱）、`shards`（會升起、飛散、落下的水晶碎片）、`haze`（低霧）。

Live AI 在解讀構想時一併挑選道具。示範規則則採用構想中以英文或繁體中文直接提到的道具（例如 "lasers" 或「雷射」、"temple" 或「神殿」、"rain" 或「雨」），一定加上光束與霧，只有在構想提到的道具少於三種時，才補上構想走向所暗示的道具。構想寫得越長、越具體，份量就越多。

## Interpretation

規劃者的輸出（`interpretation.ts`）：`title`、`summary`、`mood`、`understood`（1–5 行，說明理解到什麼）、`tempoBpm`、3–6 個 `phases`（名稱、原型、權重 1–5、`energyFrom` 與 `energyTo`、幾何形態、聲音質地、備註）、舞台 `set`、可為 null 的 `climax`（`phaseIndex`、`release`、`holdBeats`）、提議的 `constraints`，以及一行 `strategy`。TypeScript 與 Python 測試共用的有效與無效 fixtures 位於 `packages/performance-core/fixtures/`。
