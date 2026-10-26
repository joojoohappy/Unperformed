# 媒體：製作方式與授權

[English](../en/media.md)

[`assets/demo/`](../../assets/demo) 中的每張圖片與影片，都是由 [`scripts/capture-media.mjs`](../../scripts/capture-media.mjs) 從執行中的工作室擷取的。沒有任何一張是手繪、假造的 mockup，或由圖像模型生成。執行 `pnpm media` 即可全部重新產生。

## 內容

| 檔案 | 內容 | 擷取方式 |
| --- | --- | --- |
| `screenshots/01-landing-imagine.png` | 首頁（想像） | 即時，1440×900 |
| `screenshots/02-intent-input.png` | 輸入構想並選擇情緒 | 即時 |
| `screenshots/03-performance-score.png` | 編譯後的 score，限制條件已核准 | 即時，整頁 |
| `screenshots/04-negotiation.png` | 高潮協商，三個選項並列 | 即時，整頁 |
| `screenshots/05-rehearsal.png` | 排練停在高潮釋放處，並做了鏡頭修改 | 即時 |
| `screenshots/06-live-performance.png` | 高潮剛釋放時的現場演出 | 即時；HUD 顯示實際量測到的影格率 |
| `screenshots/07-review.png` | Session 回顧 | 即時，整頁 |
| `screenshots/08-negotiation-zh-TW.png` | 繁體中文的協商畫面 | 即時，整頁 |
| `screenshots/09-mobile-score.png` | 手機寬度（412 px，2×）的 score | 即時 |
| `unperformed-demo.mp4` | 完整工作流程，89 秒，含聲音與英文＋繁體中文字幕 | 逐格擷取（見下文） |
| `unperformed-demo.en.srt` / `.vtt`、`unperformed-demo.zh-TW.srt` / `.vtt` | 字幕檔 | 由擷取腳本依同一份字幕清單產生 |
| `unperformed-demo-preview.webp` | README 用的短動畫預覽 | 從 MP4 剪出 |
| `unperformed-demo-poster.jpg` | 封面影格 | 從 MP4 剪出 |
| `capture-manifest.json` | 瀏覽器版本、尺寸、方法 | 由擷取腳本寫入 |

所有擷取都使用**示範模式**：沒有呼叫任何 AI 模型，介面上也如此標示。

## 環境

在 4 核心、無 GPU 的 Linux container 中以 headless Chromium（Playwright）執行。WebGL 由 SwiftShader 在 CPU 上渲染。工作室由 Vite dev server 提供。

## 影片的製作方式

軟體 WebGL 無法即時渲染這個舞台（實測約 12 fps，見[評估](evaluation.md)）。即時錄製螢幕會得到斷斷續續的影片，無論如何都無法正確呈現這個應用程式。因此：

1. **介面步驟**（輸入、點擊、選擇）是實際介面的截圖，每張停留固定時間。
2. **演出**逐格擷取。Playwright 的虛擬時鐘先暫停，每次前進恰好 1/30 秒，再對舞台截圖。每個影格都是應用程式在時間軸該位置實際渲染的畫面。全黑是在擷取過程中以鍵盤按下的，和使用者操作方式相同。
3. **聲音**由應用程式本身的音訊引擎（`apps/web/src/audio/engine.ts` 中的 `renderOffline`）以同一份 score 渲染後合成進影片。全黑期間，音軌套用了與應用程式相同的音量變化（0.25 取代 0.9）。
4. **影格率讀數只在影片中隱藏**，因為在虛擬時鐘下量到的影格率沒有意義。截圖中顯示的是真實量測值。
5. 字幕燒錄在應用程式畫面下方（英文與繁體中文），另外也提供獨立的 SRT 與 WebVTT 檔。

## 授權

- **截圖、影片、預覽、封面與字幕**屬於本 repository，與程式碼同樣以 [Apache License 2.0](../../LICENSE) 釋出。
- 其中的**畫面與聲音**都是應用程式在執行時程序化生成的。沒有使用取樣音檔、素材影片、貼圖或第三方媒體。
- 媒體中可見的**字型**透過 Fontsource 打包，以 SIL Open Font License 1.1 授權：Instrument Serif、Inter 與 JetBrains Mono。燒錄字幕使用擷取機器上安裝的 Inter 與文泉驛正黑（GPL，附字型嵌入例外）；字型本身並未重新散布。

## 第三方軟體

本應用程式建立在開源函式庫之上，包括 React（MIT）、three.js（MIT）、zod（MIT）、Vite（MIT）、FastAPI（MIT）、Pydantic（MIT）與 Anthropic Python SDK（MIT）。各自的授權條款收錄在套件中；確切版本見 `pnpm-lock.yaml` 與 `services/ai/uv.lock`。
