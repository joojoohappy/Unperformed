# 評估

[English](../en/evaluation.md)

測試與量測了什麼、怎麼量，以及這些數字代表與不代表什麼。以下每個數字都是在所述機器上實際量測的，沒有任何估算或引用他處的數字。原始結果見 [`docs/evaluation/bench-core.json`](../evaluation/bench-core.json) 與 [`docs/evaluation/bench-browser.json`](../evaluation/bench-browser.json)。

## 測試

| 測試組 | 指令 | 數量 | 結果（2026-10-26） |
| --- | --- | --- | --- |
| 核心單元測試（vitest） | `pnpm --filter @unperformed/performance-core test` | 101 | 全部通過 |
| Web 單元測試（vitest） | `pnpm --filter @unperformed/web test` | 16 | 全部通過 |
| 端對端測試（Playwright，桌面 1440×900 與 Pixel 7） | `pnpm test:e2e` | 13 × 2 個 project = 26 | 全部通過 |
| Live AI 服務（pytest） | `pnpm test:ai` | 28 | 全部通過；ruff 與 mypy（strict）無問題 |
| Lint 與型別檢查 | `pnpm lint && pnpm typecheck` | | 無問題 |

涵蓋範圍：

- **Schema：** 有效與無效的 score、跨欄位規則、JSON Schema 匯出。
- **權限：** 各層級、鎖定欄位、核准、對所有行為者保留限制條件、全有或全無的套用。
- **協商：** 高潮、更溫暖的結尾、更混亂與速度的提案、沒有真正分歧時不反對、折衷選項、重複請求時的 deferral、限制條件衝突（保留／替代方案／解除）、安全提示、超出範圍或未經規則支持的模型建議。
- **無效的模型輸出：** 共用 fixtures（錯誤的高潮索引、未知的列舉值、多餘欄位、階段太少）同時被 zod 與 Pydantic 拒絕；服務會帶著驗證錯誤重試，最後一次仍失敗時回報 `invalid_model_output`。（瀏覽器在使用任何服務回應前也會以 zod 驗證；這條路徑尚未有專屬測試。）
- **時間軸與重播：** 確定性（`timelineFingerprint`）、釋放前的壓抑、全暗、減少動態效果、閃爍上限、閃光檢查。
- **渲染備援：** 形態替代鏈與渲染器選擇；在瀏覽器中，`?renderer=canvas` 會以 2D 渲染器跑完演出。
- **自適應畫質：** 單元測試涵蓋控制器（預算、暖機、忽略暫停、容許偶發的慢影格、不會再升回、固定模式）；在瀏覽器中，把影格拖慢到 30 ms 時 WebGL 舞台會降為低畫質，HUD 與回顧都會標示；`?quality=full` 則維持完整畫質。
- **Session：** reducer、事件紀錄與回顧。
- **i18n：** 英文與繁體中文的 key 與佔位符一致，並涵蓋核心輸出的每個 key。
- **端對端：** 以示範模式跑完六個階段（且沒有 console 錯誤）、限制條件衝突與安全、繁體中文介面、重新整理後保留 session、2D 備援，以及在網路邊界模擬服務的 Live AI（模型標示、用量記錄、協商呼叫失敗時改用規則並標示、解讀失敗時回報錯誤而不捏造結果）。

## 量測環境

- 4 核心 Intel Xeon Linux container，**沒有 GPU**（核心耗時在 2.10 GHz 上量測，瀏覽器量測在 2.80 GHz 上；container 主機會變動）。
- Node.js 22.22.0。
- Headless Chromium 153（Playwright 1.63），**WebGL 由 SwiftShader 在 CPU 上渲染**，視窗 1440×900。

## 核心耗時（`pnpm bench`）

暖機後多次執行的中位數與第 95 百分位數。

| 步驟 | 次數 | 中位數 | p95 |
| --- | --- | --- | --- |
| 示範規劃者（`demoInterpret`） | 2000 | 0.006 ms | 0.009 ms |
| 編譯 Interpretation → 經驗證的 score | 2000 | 0.09 ms | 0.24 ms |
| 驗證 score（zod） | 2000 | 0.04 ms | 0.10 ms |
| 套用 patch（核准限制條件） | 2000 | 0.22 ms | 0.40 ms |
| 開啟高潮協商回合 | 2000 | 0.90 ms | 1.92 ms |
| 開啟並決定一個回合 | 1000 | 1.18 ms | 3.19 ms |
| 以 60 fps 取樣 75 秒時間軸（4,500 個影格） | 50 | 2.2 ms | 6.5 ms |
| 以 60 fps 檢查 75 秒時間軸的閃光 | 50 | 3.2 ms | 6.0 ms |

- 取樣一個影格約需 0.5 µs，時間軸永遠不會是瓶頸。
- 時間軸是確定性的：同一個構想編譯兩次，指紋完全相同。
- 閃光檢查：示範 score 每秒 **0** 次閃光；每段都設定最大閃爍的 score 也是 **0** 次（上限為 3）。引擎的 2 Hz／30% 上限讓亮度變化維持在 10% 閃光門檻以下。

## 瀏覽器（`pnpm bench:browser`）

以 `vite preview` 提供 production build，於 2026-10-26 在上述環境中量測。每次執行都演出 76 秒的示範 score 20 秒。`full` 與 `reduced` 以 `?quality=` 固定畫質；`auto` 是使用者實際得到的行為。

| | WebGL full | WebGL reduced | WebGL auto | Canvas2D |
| --- | --- | --- | --- | --- |
| 首次載入到標題出現 | 100 ms | 69 ms | 82 ms | 74 ms |
| DOMContentLoaded | 59 ms | 30 ms | 33 ms | 27 ms |
| 在瀏覽器中編譯 score | 2.1 ms | 2.0 ms | 2.1 ms | 2.2 ms |
| 演出時的平均影格率 | **10 fps** | **20 fps** | 18 fps | 60 fps |
| 第 95 百分位影格時間 | 118.7 ms | 59.0 ms | 103.9 ms | 17.0 ms |
| 結束時的畫質 | full | reduced | reduced | full |

Bundle：初始 JavaScript 為 339 KB（gzip 後 105 KB），另有 33 KB 的 CSS（gzip 後 13 KB）。three.js 與 WebGL 舞台是另一個 471 KB 的 chunk（gzip 後 119 KB），在第一次出現舞台時（編排、排練、演出）才載入。拆分之前全部是一個 784 KB 的檔案（gzip 後 216 KB）。

這些數字包含依段落類型的美術指導（可見的光束、地面格線與移動的霧氣，見 `apps/web/src/stage/look.ts`）。加入之前，同一個基準測試量到完整畫質 12 fps、低畫質 26 fps。在 SwiftShader 上，每多一個透明表面都要花 CPU 時間；在 GPU 上的成本尚未量測。

**這代表什麼。** 10 fps 是 CPU 模擬 GPU 的結果，是下限，而不是在一般電腦上的體驗。在這裡低畫質讓影格率加倍，但軟體 WebGL 仍達不到 20 ms 的預算。`auto` 欄混合了切換前後的影格。同一環境中，2D 渲染器能跑到螢幕更新率。載入時間來自本機伺服器，不包含網路傳輸。

在同一環境中，把視窗縮成一半（720×450，像素為四分之一）讓完整畫質從 12 fps 提升到 41 fps；而只把元素減半並移除霧氣，大約只多 2 fps。舞台的瓶頸在填充率（fill-bound），所以低畫質也會降低解析度。

應用程式內的影格率（顯示於演出 HUD 與回顧）是在演出時由 `requestAnimationFrame` 間隔量測的。

## 自適應畫質

舞台從第一個影格起就量測自己的影格間隔。暖機 20 個影格後，它保留最近 120 個間隔；當視窗已滿或已涵蓋 2 秒時，每 10 個影格檢查一次。若第 95 百分位高於 **20 ms**，就切換為低畫質：

| | 完整 | 低畫質 |
| --- | --- | --- |
| 繪製的元素 | 240 | 120（每隔一個，形態維持原樣） |
| 霧氣 | 開 | 關 |
| 像素比（pixel ratio） | 裝置值，上限 2 | 1 × 0.7（1× 螢幕約一半像素，3× 螢幕約六分之一） |

編舞、時間軸、燈光顏色與安全限制都不變。切換只會往下：否則較慢的裝置會在演出中途來回切換。同一頁面上只要有一個舞台降過畫質，之後的舞台會直接以低畫質開始。超過 250 ms 的間隔（分頁被隱藏）會被忽略。發生降級時，HUD 與回顧會顯示「已降低畫質」。

可用 `?quality=full` 或 `?quality=reduced` 覆寫（例如量測時）。

## 真實硬體

**尚未量測。** 目前沒有任何有 GPU 的瀏覽器或手機的量測結果。這張表只會填入實際量測的數值。

| 裝置 | 瀏覽器 | GL renderer | WebGL full | WebGL auto | Canvas2D |
| --- | --- | --- | --- | --- | --- |
| 有 GPU 的桌機 | — | — | 尚未量測 | 尚未量測 | 尚未量測 |
| 中階手機 | — | — | 尚未量測 | 尚未量測 | 尚未量測 |

量測方式：

- **有 GPU 的桌機。** 先 `pnpm install`，第一次執行 `pnpm --filter @unperformed/web exec playwright install chromium`，然後執行 `BENCH_GPU=1 pnpm bench:browser`。會開啟一個可見的 Chromium 視窗，使用這台機器的 GPU；請讓它保持在最前面，在它關閉前不要操作電腦（約 2 分鐘）。結果（包含 GL renderer 字串）會寫入 `docs/evaluation/bench-browser-gpu.json`。
- **手機。** 關閉省電模式（它會限制影格率），開啟公開示範 [`https://joojoohappy.github.io/Unperformed/?quality=full`](https://joojoohappy.github.io/Unperformed/?quality=full)（或在同一個 Wi-Fi 下的電腦上執行 `pnpm build` 與 `pnpm --filter @unperformed/web exec vite preview --host`，再開啟 `http://<電腦的區網 IP>:4173/?quality=full`）。選一個範例，進入演出，讓整場演出播完，再打開回顧：「演出 FPS」會顯示平均影格率、p95 影格時間與渲染器。接著不加 `?quality=full`（auto）以及加上 `?renderer=canvas` 各重複一次。記下手機型號與瀏覽器版本。

## Live AI：模型呼叫、延遲與成本

**尚未量測。** 開發 MVP 時沒有可用的 API key，因此沒有發出過任何真實的模型呼叫。本 repository 中沒有任何地方回報真實模型的延遲、token 用量、成本或輸出品質。

已備妥的量測機制：

- 每個 Live AI 回應都帶有 `latencyMs`、`attempts`、`inputTokens`、`outputTokens`（所有嘗試的總和）與 `estimatedCostUsd`；
- 工作室會在每個 session 中記錄它們，並顯示在回顧的遙測區（模型呼叫次數、token、成本、各類呼叫的延遲）；
- 匯出的 session JSON 包含以上所有資料。

量測方式（後續工作）：

1. 帶著 key 啟動服務與工作室（`pnpm dev:ai`、`pnpm dev`）。
2. 在 Live AI 模式下，用一組構想跑完流程（例如兩種語言各三個範例加上自己的構想），每次都提出高潮請求。
3. 從回顧匯出每個 session，記錄各類呼叫的延遲中位數與最大值、嘗試次數、token 與成本，並註明模型 id 與日期。
4. 記下任何驗證重試或備援，回顧中都有紀錄。

在示範模式下，回顧顯示 0 次模型呼叫與 $0，這是量測結果，不是佔位符。

## 使用者研究

尚未進行任何使用者研究。本專案沒有宣稱任何使用者研究的發現。
