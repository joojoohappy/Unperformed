# 參與貢獻 UNPERFORMED

[English](CONTRIBUTING.md) · 繁體中文

感謝你的協助。這個專案規模小、立場明確；以下說明是為了讓它保持這樣。

## 環境設定

```bash
pnpm install                 # Node 20 以上（建議 22）、pnpm 10
pnpm dev                     # 工作室位於 http://localhost:5173，示範模式
cd services/ai && uv sync    # 只有在修改 Live AI 時才需要（Python 3.11 以上）
```

## 開 pull request 之前

```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm test:e2e                # Playwright 端對端測試
pnpm test:ai                 # 若有修改 services/ai
```

CI 會執行相同的指令，請保持全部通過。

## 原則

以下是本專案不可退讓的原則。任何削弱其中一項的修改，請先開 issue 討論設計。

1. **誠實的工程。** 絕不把規則包裝成 AI。每則訊息都標示來源。絕不捏造量測數據、錄影或模型輸出；沒有量測過的就直說。
2. **權限由程式碼執行。** 對 score 的每一個修改都是經過 `applyPatch` 的 typed patch。新增的編輯類型需要對應的權限規則，以及 `packages/performance-core/test/authority.test.ts` 中的測試。
3. **Score 只是資料。** schema 中不允許可執行的內容。
4. **安全機制在引擎內。** 閃爍上限與減少動態效果不是 score 能覆寫的設定。
5. **兩種語言。** 每一個使用者可見的字串都要同時放進 `apps/web/src/i18n/en.ts` 與 `zh-TW.ts`；i18n 測試會檢查兩者一致。文件位於 `docs/en` 與 `docs/zh-TW`；請同時更新，或開 issue 請求翻譯。
6. **確定性的核心。** `packages/performance-core` 不使用 DOM、網路或時鐘，請維持如此。

## 程式碼位置

| 修改內容 | 位置 | 測試 |
| --- | --- | --- |
| Score 欄位與規則 | `packages/performance-core/src/schema.ts` | `test/schema.test.ts`，之後執行 `pnpm --filter @unperformed/performance-core schema` |
| 權限 | `src/patch.ts` | `test/authority.test.ts` |
| 協商 | `src/negotiation.ts` | `test/negotiation.test.ts` |
| 時間軸與安全 | `src/timeline.ts`、`src/safety.ts` | `test/timeline.test.ts` |
| 介面 | `apps/web/src/views`、`components` | `apps/web/e2e` |
| Live AI | `services/ai/src/unperformed_ai` | `services/ai/tests` |

若修改 Interpretation 契約，請同時更新 zod schema 與 Pydantic models；`packages/performance-core/fixtures` 中的共用 fixtures 會被兩邊的測試檢查。

## 媒體

截圖與示範影片以 `pnpm media` 重新產生。絕不以修圖或生成的圖片取代。詳見 `docs/zh-TW/media.md`。

## Commit 與 pull request

小而專注的 pull request 最容易審查。請說明修改了什麼、如何驗證。提交貢獻即表示你同意以 Apache License 2.0 授權你的貢獻。
