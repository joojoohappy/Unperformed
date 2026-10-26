# 權限政策

[English](../en/authority-policy.md)

誰可以修改什麼，由 `packages/performance-core/src/patch.ts` 中的確定性程式碼決定，而不是由 prompt 決定。可以要求模型遵守界線，但只有程式碼能保證。`packages/performance-core/test/authority.test.ts` 中的測試固定了以下每一條規則。

## 三個層級

每個 patch 操作都會由 `authorityOf(op, score)` 對照目前的 score 分類：

| 層級 | 意義 | 例子 |
| --- | --- | --- |
| `ai` | 導演可以自行決定並回報的例行調度。 | 鏡頭運動；小幅能量調整（≤ 0.15）；高潮以外的小幅燈光調整；高潮以外的幾何密度或秩序；高潮以外的轉場。 |
| `shared` | 有意義的創作修改，需要人明確選擇。 | 高潮段落中的任何修改；release 模式與壓抑拍數；色盤；速度；幾何形態；聲音質地；超過 0.15 的能量變化或新的曲線；主光或強調光顏色；閃爍增加超過 0.1。 |
| `human` | 只有人能做的意圖層級決定。 | 新增、移除、核准或拒絕限制條件。 |

## `applyPatch` 如何執行

`applyPatch(score, patch, { actor, humanApproved })` 要嘛套用所有操作，要嘛一個都不套用：

1. Patch 必須能被解析（typed 操作、數值範圍）。
2. 若行為者是 AI：
   - 任何 `human` 層級的操作都會被拒絕（`human-only`）；
   - 任何 `shared` 層級的操作都會被拒絕，除非人核准了這個確切的 patch（`needs-approval`），例如在協商中選擇了它；
   - 任何位於 `humanLocked` 的欄位都會被拒絕，除非已被核准（`human-locked`）。
3. 在副本上套用操作。
4. 結果必須是有效的 score。
5. 結果必須滿足**所有已核准的限制條件，無論行為者是誰**。想打破限制條件的人，必須在同一個 patch 中移除它；協商會把這件事列為一個獨立、清楚標示的選項。
6. 由人修改的欄位，或由人核准的 AI patch 修改的欄位，會加入 `humanLocked`，導演之後無法悄悄改回去。

被拒絕的 patch 會回傳原本的 score 與 typed 的原因。不會有部分套用的情況。

## 限制條件

限制條件在編譯時是 `proposed`。人核准之前，它只是建議，不會被執行。已核准的限制條件是精確的判斷式（`constraints.ts`）：

| 種類 | 成立條件 |
| --- | --- |
| `ending-silence` | 最後一段的聲音質地是 `silence`，能量結束於 ≤ 0.05，燈光 ≤ 0.1。 |
| `opening-order` | 第一段的幾何秩序 ≥ 0.9，且沒有 tremor 鏡頭。 |
| `no-strobe` | 沒有任何段落的閃爍超過 0.15。 |
| `max-energy` | 沒有任何段落的能量超過指定上限。 |
| `keep-climax` | Score 中仍有高潮段落。 |

## 安全不是創作意見

無論 score 怎麼寫，時間軸都把燈光閃爍限制在 2 Hz（`MAX_FLICKER_HZ`），且亮度最多降低 30%。頻閃請求會得到安全提示與一個安全的脈動選項；協商從不把它當成品味問題。`safety.ts` 依 WCAG 2.3.1 一般閃光門檻（任何一秒內不超過三次閃光）檢查取樣後的時間軸；benchmark 會對示範 score 以及每段都設定最大閃爍的最壞情況執行這項檢查。

## 模型的位置

模型的輸出從不直接進入 `applyPatch`。Live AI 回傳的是 `Interpretation`（由與示範規則相同的編譯器編譯），或協商回合中的建議。在回合中，模型可以撰寫理由並建議壓抑的拍數，但：

- 導演是否提出反對，由 `ruleBasedClimaxAdvice` 中的規則決定（進入高潮時舞台能量是否已達 60% 以上？），因此模型無法為了顯得有自主性而反對；
- 建議的壓抑拍數會被限制在 2–16 拍，且短於段落長度；
- 產生的選項仍然是一個需要人選擇的 patch。
