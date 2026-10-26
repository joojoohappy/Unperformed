# 架構

[English](../en/architecture.md)

UNPERFORMED 分成三個部分，每個部分只負責一件事。

```
┌──────────────────────────── apps/web（瀏覽器）─────────────────────────────┐
│  React 工作室：想像 · 編排 · 協商 · 排練 · 演出 · 回顧                      │
│                                                                             │
│  ai/director.ts ── 示範規則 ──┐          session reducer（事件紀錄）        │
│        │                      ▼                     │                       │
│        │ Live AI      packages/performance-core     ▼                       │
│        │ (fetch)      schema · compiler · patch · negotiation · timeline   │
│        │                      │                                            │
│        │                      ▼  StageFrame（beat 的純函式）                │
│        │        舞台：WebGL（three.js）或 Canvas2D    音訊：Web Audio        │
│        │                 ▲ beat                         │ 主時鐘            │
│        │                 └──────── playback/transport ◀─┘                   │
└────────┼────────────────────────────────────────────────────────────────────┘
         │ /api（開發時經由 Vite proxy）
┌────────▼──────────── services/ai（選用，持有 API key）──────────────────────┐
│  FastAPI · Pydantic 契約 · Claude structured outputs · 重試 · 用量          │
└─────────────────────────────────────────────────────────────────────────────┘
```

## packages/performance-core

純 TypeScript，只依賴 zod。不使用 DOM、網路或時鐘。每個函式都是確定性的，因此瀏覽器、測試與 benchmark 執行的是同一份程式碼。

| 模組 | 職責 |
| --- | --- |
| `schema.ts` | **Performance Score**：由段落（section）組成，每段包含能量、幾何、燈光、鏡頭、聲音、轉場與釋放（release），另有色盤、限制條件（constraints）與 `humanLocked`。跨欄位規則（段落連續、只有高潮段落可設定 release、id 不重複）在 `superRefine` 中檢查。 |
| `interpretation.ts` | **Interpretation**：規劃者（規則或模型）唯一會產出的東西。內容小而偏創意（階段、情緒、高潮、提議的限制條件），不含時間計算。使用 `.strict()`，未知欄位會被拒絕。 |
| `compiler.ts` | Interpretation → Score。以最大餘數法分配小節，依原型（archetype）與情緒推導各段參數，並做出附帶理由的例行「AI 本地決策」（鏡頭運動）。輸出前會先通過驗證。 |
| `patch.ts` | 修改 score 的唯一途徑：typed patch 操作、**權限政策**（`authorityOf`），以及全有或全無的 `applyPatch`。 |
| `constraints.ts` | 每種限制條件都是對 score 的精確判斷式。 |
| `negotiation.ts` | 修改請求、導演的回應、附帶精確差異的選項、合併選項與 session 記憶。 |
| `timeline.ts` | `sample(score, beat)` → `StageFrame`。時間的純函式：釋放前的壓抑、轉場、全黑、閃爍上限、鏡頭位置、減少動態效果。 |
| `safety.ts` | 對取樣後的時間軸進行 WCAG 2.3.1 一般閃光檢查。 |
| `effects.ts` | 渲染器能力宣告與幾何形態的替代鏈。 |
| `demoPlanner.ts` | 示範模式的確定性規則規劃者（支援英文與繁體中文線索）。 |
| `session.ts` | Session reducer 與 typed 事件紀錄。每個人類、AI 與系統動作都是帶有行為者（actor）的事件。 |
| `review.ts` | 只根據已記錄的事件與兩份 score 建立回顧。 |

## apps/web

Vite、React 18 與 three.js。工作室本身不含創作邏輯：它把動作送進核心的 reducer、渲染 `StageFrame`，並播放聲音。

- **Transport。** 有聲音時，Web Audio 時鐘就是主時鐘；舞台在每個動畫影格向 transport 詢問目前的 beat。聲音關閉或無法使用時，改用 `performance.now()` 時鐘。
- **舞台。** `stage/layout.ts` 把一個影格轉成 240 個 instanced 元素的變換。`webgl.ts`（three.js、instanced mesh、聚光與輪廓光、霧氣）與 `canvas2d.ts`（平面投影）繪製同一份 layout。沒有 WebGL 或設定 `?renderer=canvas` 時使用 2D 渲染器。
- **音訊。** `audio/engine.ts` 依段落排程振盪器、濾波噪音與包絡。沒有任何取樣或下載的音檔。`renderOffline` 透過 `OfflineAudioContext` 渲染同一份 score。
- **AI client。** `ai/director.ts` 選擇示範規則或 Live AI 服務。`ai/live.ts` 在使用任何回應前都以 zod 驗證。
- **狀態。** Session 與偏好設定保存在 `localStorage`，重新整理後會延續同一個 session。
- **i18n。** 英文與繁體中文的 typed key 表。核心輸出的是 `Text` 值（`{ key, params }`）而非字串，因此所有訊息（包括歷史紀錄）都會隨介面切換語言。

## services/ai

選用。FastAPI，使用與核心契約對應的 Pydantic 模型。每個 endpoint 對 Claude 發出一次 structured-output 呼叫、驗證回覆、必要時帶著驗證錯誤重試，並回報延遲、嘗試次數、token 數與估計成本。詳見 [services/ai/README.md](../../services/ai/README.md)。

服務永遠不會直接修改 score。它回傳 Interpretation 或建議，瀏覽器再把它送進與示範規則相同的確定性編譯器與權限檢查。

## 一個 session 的資料流

1. **想像。** 文字 → 規劃者（規則或模型）→ `Interpretation`。
2. **編排。** `compile()` → 經驗證的 `PerformanceScore`。限制條件以 `proposed` 狀態出現，由人核准或移除。
3. **協商。** 請求 → `openRound()` → 附帶精確差異的選項。選定的選項以 `applyPatch` 套用。
4. **排練。** 拖動時間軸；人的編輯是 `actor: "human"` 的 patch，並成為 `humanLocked`。
5. **演出。** Transport + `sample()` + 渲染器 + 音訊。暫停、全黑與主亮度都會被記錄為介入。
6. **回顧。** `buildReview()` 讀取事件紀錄以及原始與最終的 score。沒有任何內容是事後生成的。
