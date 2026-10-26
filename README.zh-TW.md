<div align="center">

# UNPERFORMED

**Imagine something. Direct its existence.**<br>
**這一次，讓你的想像成為真實的舞台，由你親自導演它。**

一個開源工作室：人與 AI 共同導演，把一個構想變成即時的視聽演出，而主導權始終在人手上。

**[立即試用線上示範](https://joojoohappy.github.io/Unperformed/?lang=zh-TW)**（示範模式，直接在瀏覽器執行，不需帳號或 key）

[English](README.md) · 繁體中文

[![CI](https://github.com/joojoohappy/Unperformed/actions/workflows/ci.yml/badge.svg)](https://github.com/joojoohappy/Unperformed/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)

<a href="assets/demo/unperformed-demo.mp4"><img src="assets/demo/unperformed-demo-preview.webp" width="720" alt="動畫預覽：導演提議先把燈光壓住 8 拍，接著高潮在落下紅色碎片的黑暗舞台上釋放。"></a>

<sub>預覽擷取自以示範模式執行的應用程式。<a href="assets/demo/unperformed-demo.mp4">觀看完整示範影片（89 秒，含聲音與中英字幕）</a>。</sub>

</div>

## 這是什麼

你用自然語言寫下一個構想：*「一場從完美秩序開始、逐漸崩解成混亂、最後歸於完全寂靜的演出。」*

UNPERFORMED 會把它變成一份 **Performance Score**：一份有型別、經過驗證的計畫，包含段落、能量、燈光、鏡頭、幾何與聲音。AI 共同導演和你一起編排。當你要求某件它認為行不通的事，它會**說一次，並說明理由**，然後提供替代方案。由你決定。接著 score 會以即時 3D 舞台與程序化聲音演出，你可以在演出中隨時介入。結束後，回顧會清楚呈現誰決定了什麼。

重點不是讓 AI 替你創作，而是探索**和**一個有主見的合作者一起工作是什麼感覺，前提是它的權限界線明確、看得見，而且由程式碼強制執行。

## 工作流程

| | 階段 | 發生什麼事 |
| --- | --- | --- |
| 1 | **想像 Imagine** | 寫下構想。選擇情緒與長度（30、60 或 75 秒），或讓導演判讀。 |
| 2 | **編排 Compose** | 構想成為經過驗證的 Performance Score。導演會提議限制條件（「以完全的寂靜結束」）；在你核准前，它們不具約束力。 |
| 3 | **協商 Negotiate** | 用自己的話提出修改。每個選項都列出確切的欄位變化。在你選擇前，什麼都不會改變。 |
| 4 | **排練 Rehearse** | 拖動時間軸，編輯任何段落。你的修改會被鎖定，AI 無法更動。 |
| 5 | **演出 Perform** | Score 即時演出（預設 75 秒）：3D 舞台與程序化音訊。隨時可以暫停、全暗或調暗燈光。 |
| 6 | **回顧 Review** | 只根據已記錄事件建立的事實紀錄：依行為者區分的決定、修改前後的 score、遙測數據。 |

<table>
  <tr>
    <td width="50%"><img src="assets/demo/screenshots/01-landing-imagine.png" alt="想像：首頁，有構想輸入欄與範例構想。"><br><sub><b>想像</b>：首頁</sub></td>
    <td width="50%"><img src="assets/demo/screenshots/02-intent-input.png" alt="想像：已輸入構想並選擇情緒。"><br><sub><b>想像</b>：寫下構想</sub></td>
  </tr>
  <tr>
    <td><img src="assets/demo/screenshots/03-performance-score.png" alt="編排：包含五個段落、能量曲線與兩個已核准限制條件的 Performance Score。"><br><sub><b>編排</b>：Performance Score</sub></td>
    <td><img src="assets/demo/screenshots/04-negotiation.png" alt="協商：導演提議先把燈光壓住 8 拍；三個選項列出各自的確切改動。"><br><sub><b>協商</b>：高潮的分歧</sub></td>
  </tr>
  <tr>
    <td><img src="assets/demo/screenshots/05-rehearsal.png" alt="排練：舞台停在高潮釋放處，旁邊是段落控制項。"><br><sub><b>排練</b>：編輯段落</sub></td>
    <td><img src="assets/demo/screenshots/06-live-performance.png" alt="演出：高潮釋放後，紅色碎片散落在溫暖的光暈上。"><br><sub><b>演出</b>：高潮剛釋放</sub></td>
  </tr>
  <tr>
    <td><img src="assets/demo/screenshots/07-review.png" alt="回顧：決策歷史、淨改動與遙測數據。"><br><sub><b>回顧</b>：誰決定了什麼</sub></td>
    <td><img src="assets/demo/screenshots/08-negotiation-zh-TW.png" alt="繁體中文的協商畫面。"><br><sub>整個工作室也能以繁體中文使用</sub></td>
  </tr>
</table>

所有截圖都是應用程式在示範模式下的實際畫面。見[媒體的製作方式](docs/zh-TW/media.md)。

## 核心情境

構想一路鋪陳，走向崩解。你提出：**「高潮的時候，我要一切都炸開。」**

導演注意到進入高潮前能量已經到了 85%，這時直接爆開，只會是「同樣的東西再多一點」。它提議**先把燈光與聲音壓住 8 拍，再釋放一切**，讓寂靜使釋放更有力量。你可以維持自己的方案、接受提案，或要求**折衷版本**（較短的 4 拍停頓，然後完全照你的方式炸開）。

無論你選哪一個，都由程式碼套用、鎖定為你的決定並記住：同樣的要求再提一次，導演不會重複反對。如果某個要求會打破你核准過的限制條件（「以完全的寂靜結束」），衝突會攤在你面前，而不是在背後被悄悄處理掉。要求頻閃，得到的是安全說明，而不是一場辯論。

## 快速開始（示範模式，不需任何憑證）

最快的方式是[線上示範](https://joojoohappy.github.io/Unperformed/?lang=zh-TW)：部署在 GitHub Pages 上的靜態版本，只提供示範模式（Live AI 需要執行中的服務，所以在那裡是關閉的）。網址參數與下方相同，例如 [`?renderer=canvas`](https://joojoohappy.github.io/Unperformed/?renderer=canvas)。

自行在本機執行：

需求：Node.js 20 以上（建議 22）與 pnpm 10。

```bash
git clone https://github.com/joojoohappy/Unperformed.git
cd Unperformed
pnpm install
pnpm dev            # http://localhost:5173
```

示範模式是確定性的，不需要 API key。它出現的每個地方都有標示：每則訊息都寫著 `示範規則（未使用 AI 模型）`。網址加上 `?lang=zh-TW` 直接進入繁體中文，或加上 `?renderer=canvas` 強制使用 2D 渲染器。

## Live AI 模式（選用）

Live AI 讓 Claude 模型解讀構想、在協商中提出意見。API key 留在本機的小型服務中，永遠不會進入瀏覽器。

需求：Python 3.11 以上與 [uv](https://docs.astral.sh/uv/)。

```bash
export ANTHROPIC_API_KEY=...             # 絕不要 commit；其他設定見 .env.example
pnpm dev:ai                              # 服務位於 127.0.0.1:8787
pnpm dev                                 # 另開一個終端機
```

在頂端列把模式切換為 **Live AI**。模型的輸出會標示模型 id。呼叫失敗時，工作室會明說：協商會改用規則並標示為「規則備援」，解讀失敗則會詢問是否改用示範規則繼續。它絕不會把規則產生的答案說成模型的答案。

設定與錯誤碼見 [services/ai/README.md](services/ai/README.md)。Live AI 已對真實 API（`claude-opus-5-5`）以六個範例構想執行過：解讀一個構想約 9 秒，每個協商請求約 3 秒，每個 session 約 $0.07。見[評估](docs/zh-TW/evaluation.md#live-ai模型呼叫延遲與成本)與[已知限制](docs/zh-TW/limitations.md)。

## 哪些是 AI，哪些不是

| 部分 | 示範模式 | Live AI 模式 |
| --- | --- | --- |
| 解讀構想（Interpretation） | 確定性規則 | Claude，structured output，經過驗證 |
| 編譯 score | 確定性編譯器 | 同一個編譯器 |
| 例行調度（鏡頭運動） | 規則，有標示 | 規則，有標示 |
| 導演是否反對 | 可測試的規則 | 同一條規則；模型可以撰寫說法並調整壓抑拍數 |
| 權限、限制條件、安全 | 程式碼 | 程式碼 |
| 回顧 | 由已記錄事件建立 | 相同 |

## 如何建構

```
packages/performance-core   schema、編譯器、權限、協商、時間軸、安全（TypeScript、zod）
apps/web                    工作室（Vite、React、three.js、Web Audio）
services/ai                 選用的 Live AI 服務（FastAPI、Pydantic、Anthropic SDK）
scripts                     benchmark 與媒體擷取
```

時間軸是 beat 的純函式，音訊時鐘驅動視覺，而對 score 的每一個修改都經過同一個有權限檢查的函式。詳見[架構](docs/zh-TW/architecture.md)。

## 測試與量測

```bash
pnpm lint && pnpm typecheck
pnpm test             # 核心（106）與 web 單元測試（16）
pnpm test:e2e         # Playwright，桌面與手機（26）
pnpm test:ai          # 服務：pytest（28）、ruff、mypy
pnpm bench            # 核心耗時
pnpm bench:browser    # bundle 大小、載入時間、headless Chromium 中的影格率
```

撰寫本文時以上全部通過。測試涵蓋 schema、權限政策、核准與拒絕流程、限制條件的保留、無效的模型輸出、時間軸重播、渲染備援、session reducer、API 契約，以及在瀏覽器中跑完整個流程（包括以模擬服務測試 Live AI）。量測數據及其意義與限制，見[評估](docs/zh-TW/evaluation.md)。

## 文件

| | 繁體中文 | English |
| --- | --- | --- |
| 架構 | [architecture.md](docs/zh-TW/architecture.md) | [architecture.md](docs/en/architecture.md) |
| 設計決策 | [design-decisions.md](docs/zh-TW/design-decisions.md) | [design-decisions.md](docs/en/design-decisions.md) |
| 權限政策 | [authority-policy.md](docs/zh-TW/authority-policy.md) | [authority-policy.md](docs/en/authority-policy.md) |
| 協商協定 | [negotiation-protocol.md](docs/zh-TW/negotiation-protocol.md) | [negotiation-protocol.md](docs/en/negotiation-protocol.md) |
| Performance Score | [performance-score.md](docs/zh-TW/performance-score.md) | [performance-score.md](docs/en/performance-score.md) |
| 評估 | [evaluation.md](docs/zh-TW/evaluation.md) | [evaluation.md](docs/en/evaluation.md) |
| 已知限制 | [limitations.md](docs/zh-TW/limitations.md) | [limitations.md](docs/en/limitations.md) |
| 媒體與授權 | [media.md](docs/zh-TW/media.md) | [media.md](docs/en/media.md) |
| 路線圖 | [roadmap.md](docs/zh-TW/roadmap.md) | [roadmap.md](docs/en/roadmap.md) |

## 無障礙與安全

無論 score 怎麼寫，引擎都把燈光調變限制在 2 Hz 與 30% 深度，低於 WCAG 2.3.1 的閃光門檻。工作室遵守系統的減少動態效果設定，也有自己的開關。介面可完全以鍵盤操作：演出中 <kbd>Space</kbd> 暫停、<kbd>B</kbd> 全暗、<kbd>Esc</kbd> 停止。

## 參與貢獻

歡迎貢獻。請閱讀 [CONTRIBUTING.zh-TW.md](CONTRIBUTING.zh-TW.md)（[English](CONTRIBUTING.md)）與[行為準則](CODE_OF_CONDUCT.md)。安全問題請依 [SECURITY.md](SECURITY.md) 回報。

## 授權

[Apache License 2.0](LICENSE)。示範媒體以相同授權釋出；見[媒體與授權](docs/zh-TW/media.md)。
