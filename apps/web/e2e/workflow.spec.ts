import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(here, "..", "..", "..", "packages", "performance-core", "fixtures", "interpretation.valid.en.json"), "utf8"));

/** Collect console errors and uncaught exceptions for the whole test. */
function watchConsole(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text());
  });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

async function fresh(page: Page, query = "") {
  await page.goto(`/${query}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`/${query}`);
}

async function composeExample(page: Page) {
  await page.locator(".example").first().click();
  await page.getByTestId("compose").click();
  await expect(page.locator(".app")).toHaveAttribute("data-stage", "compose");
}

async function approveAll(page: Page, label = "Approve") {
  const approve = page.getByRole("button", { name: label, exact: true });
  while (await approve.count()) await approve.first().click();
}

test("demo mode: imagine → compose → negotiate → rehearse → perform → review", async ({ page }) => {
  const errors = watchConsole(page);
  await fresh(page);

  // IMAGINE
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Imagine something.");
  await expect(page.getByTestId("mode-line")).toContainText("no AI model is called");
  await page.getByTestId("compose").click();
  await expect(page.locator(".field-error")).toBeVisible(); // empty idea is refused
  await composeExample(page);

  // COMPOSE
  await expect(page.locator(".understood li").first()).toContainText("Arc:");
  await expect(page.locator(".source").first()).toContainText("demo rules");
  await expect(page.locator(".section-row")).toHaveCount(5);
  await approveAll(page);
  await expect(page.getByTestId("constraint-ending-silence")).toContainText("Approved");
  await page.getByTestId("to-negotiate").click();

  // NEGOTIATE: the core scenario
  await page.getByTestId("suggest-1").click();
  await page.getByTestId("send-request").click();
  const round = page.getByTestId("round").first();
  await expect(round).toHaveAttribute("data-kind", "proposal");
  await expect(round).toContainText("holding the light back for 8 beats");
  await expect(page.getByTestId("to-rehearse")).toBeDisabled(); // must decide first
  await page.getByTestId("combine").click();
  await expect(page.getByTestId("option-combined")).toBeVisible();
  await page.getByTestId("choose-ai").click();
  await expect(page.getByTestId("option-ai")).toContainText("Chosen");
  await expect(page.getByTestId("option-ai")).toContainText("held");

  // Asking again does not trigger the same objection.
  await page.locator("#request").fill("Make everything explode at the climax");
  await page.getByTestId("send-request").click();
  await expect(page.getByTestId("round").first()).toHaveAttribute("data-kind", "deferral");
  await page.getByTestId("choose-human").click();

  await page.getByTestId("to-rehearse").click();

  // REHEARSE: adjust one decision and see it in the score
  await expect(page.locator(".stage")).toBeVisible();
  await page.getByTestId("camera-select").selectOption("static");
  await expect(page.locator(".human-note")).toBeVisible();
  await page.getByTestId("rehearse-play").click();
  await page.waitForTimeout(800);
  await page.getByTestId("rehearse-play").click();
  await page.getByTestId("to-perform").click();

  // PERFORM
  await page.getByTestId("begin").click();
  await expect(page.locator(".hud")).toBeVisible();
  await page.waitForTimeout(1500);
  await page.getByTestId("pause").click();
  await expect(page.getByTestId("pause")).toHaveText("Resume");
  await page.getByTestId("pause").click();
  await page.keyboard.press("b");
  await expect(page.getByRole("button", { name: "Blackout" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("b");
  await page.getByTestId("stop").click();
  await expect(page.getByTestId("perform-ended")).toBeVisible();
  await page.getByTestId("to-review").click();

  // REVIEW: a factual history
  const history = page.getByTestId("history");
  await expect(history).toContainText("Wrote the creative intent");
  await expect(history).toContainText("Approved constraint");
  await expect(history).toContainText("Chose: the director's proposal");
  await expect(history).toContainText("Rehearsal edit");
  await expect(history).toContainText("Stopped the performance");
  await expect(history).toContainText("Called a blackout");
  await expect(page.locator(".changes").first()).toContainText("camera");
  await expect(page.getByTestId("telemetry")).toContainText("demo mode");

  expect(errors).toEqual([]);
});

test("constraint conflicts and safety limits are surfaced, not overridden", async ({ page }) => {
  await fresh(page);
  await composeExample(page);
  await approveAll(page);
  await page.getByTestId("to-negotiate").click();

  await page.getByTestId("suggest-3").click();
  await page.getByTestId("send-request").click();
  const conflict = page.getByTestId("round").first();
  await expect(conflict).toHaveAttribute("data-kind", "constraint-conflict");
  await expect(conflict).toContainText("End in complete silence");
  await page.getByTestId("choose-keep").click();

  await page.getByTestId("suggest-4").click();
  await page.getByTestId("send-request").click();
  await expect(page.getByTestId("round").first()).toHaveAttribute("data-kind", "safety");
  await expect(page.getByTestId("round").first()).toContainText("2 Hz");
});

test("the warm-ending, chaos and tempo scenarios object only where a rule finds a difference", async ({ page }) => {
  const errors = watchConsole(page);
  await fresh(page);
  await composeExample(page);
  await approveAll(page);
  await page.getByTestId("to-negotiate").click();
  const latest = page.getByTestId("round").first();

  // More chaos: the fracture would be as broken as the climax.
  await page.getByTestId("suggest-6").click();
  await page.getByTestId("send-request").click();
  await expect(latest).toHaveAttribute("data-kind", "proposal");
  await expect(latest).toContainText("with order held at 0.2");
  await latest.getByTestId("combine").click();
  await expect(latest.getByTestId("option-combined")).toContainText("Order 0.125");
  await latest.getByTestId("choose-combined").click();

  // Faster: the closing silence would drop under 12 s.
  await page.getByTestId("suggest-7").click();
  await page.getByTestId("send-request").click();
  await expect(latest).toHaveAttribute("data-kind", "proposal");
  await expect(latest).toContainText("I suggest 140 BPM");
  await expect(latest.getByTestId("combine")).toHaveCount(0); // no honest middle ground here
  await latest.getByTestId("choose-ai").click();
  await expect(latest.getByTestId("option-ai")).toContainText("Chosen");

  // Asking again defers to the decision.
  await page.locator("#request").fill("Speed it up");
  await page.getByTestId("send-request").click();
  await expect(latest).toHaveAttribute("data-kind", "deferral");
  await latest.getByTestId("choose-human").click();

  // Warm ending: the approved silence constraint is surfaced, with an afterglow that respects it.
  await page.getByTestId("suggest-5").click();
  await page.getByTestId("send-request").click();
  await expect(latest).toHaveAttribute("data-kind", "constraint-conflict");
  await expect(latest).toContainText("End in complete silence");
  await expect(latest.getByTestId("option-ai")).toContainText("Warm afterglow");
  await latest.getByTestId("choose-ai").click();
  await expect(latest.getByTestId("option-ai")).toContainText("Chosen");
  expect(errors).toEqual([]);
});

test("a warm ending on an unconstrained silence gets a proposal, not a conflict", async ({ page }) => {
  await fresh(page);
  await composeExample(page); // constraints stay proposed, so they do not bind
  await page.getByTestId("to-negotiate").click();
  await page.getByTestId("suggest-5").click();
  await page.getByTestId("send-request").click();
  const round = page.getByTestId("round").first();
  await expect(round).toHaveAttribute("data-kind", "proposal");
  await expect(round).toContainText("warm afterglow");
  await expect(round).toContainText("demo rules");
});

test("Traditional Chinese interface", async ({ page }) => {
  const errors = watchConsole(page);
  await fresh(page, "?lang=zh-TW");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-TW");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("想像一件事");
  await composeExample(page);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("秩序，崩解");
  await expect(page.getByText("導演理解到的內容")).toBeVisible();
  await approveAll(page, "核准");
  await page.getByTestId("to-negotiate").click();
  await page.getByTestId("suggest-1").click();
  await page.getByTestId("send-request").click();
  await expect(page.getByTestId("round").first()).toContainText("建議先把燈光壓住 8 拍");
  // Switching language keeps the session.
  await page.getByRole("button", { name: "EN", exact: true }).click();
  await expect(page.getByTestId("round").first()).toContainText("holding the light back");
  expect(errors).toEqual([]);
});

test("session survives a reload", async ({ page }) => {
  await fresh(page);
  await composeExample(page);
  await page.reload();
  await expect(page.locator(".app")).toHaveAttribute("data-stage", "compose");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Order, Undone");
});

test("2D canvas fallback renders the performance when WebGL is not used", async ({ page }) => {
  await fresh(page, "?renderer=canvas");
  await composeExample(page);
  await page.locator('.stepper button[data-stage="perform"]').click();
  await page.getByTestId("begin").click();
  await expect(page.locator(".stage-perform")).toHaveAttribute("data-renderer", "canvas2d");
  await expect(page.locator(".hud")).toContainText("canvas2d");
});

test("adaptive quality: slow frames reduce the stage and the review records it", async ({ page }) => {
  // Make every animation frame take at least 30 ms, whatever the machine.
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (cb) =>
      raf((t) => {
        const end = performance.now() + 30;
        while (performance.now() < end) {
          // busy-wait
        }
        cb(t);
      });
  });
  const errors = watchConsole(page);
  await fresh(page);
  await composeExample(page);
  await page.locator('.stepper button[data-stage="perform"]').click();
  await page.getByTestId("begin").click();
  const stage = page.locator(".stage-perform");
  await expect(stage).toHaveAttribute("data-renderer", "webgl");
  await expect(stage).toHaveAttribute("data-quality", "reduced", { timeout: 45_000 });
  await expect(page.locator(".hud")).toContainText("reduced quality");
  await page.getByTestId("stop").click();
  await page.getByTestId("to-review").click();
  await expect(page.getByTestId("telemetry")).toContainText("reduced quality");
  expect(errors).toEqual([]);
});

test("adaptive quality: ?quality=full keeps full quality", async ({ page }) => {
  await fresh(page, "?quality=full");
  await composeExample(page);
  await page.locator('.stepper button[data-stage="perform"]').click();
  await page.getByTestId("begin").click();
  await expect(page.locator(".hud")).toContainText("fps");
  await expect(page.locator(".stage-perform")).toHaveAttribute("data-quality", "full");
});

test.describe("Live AI mode (service mocked at the network boundary)", () => {
  test.beforeEach(async ({ page }) => {
    await page.route("**/api/health", (r) =>
      r.fulfill({ json: { status: "ok", provider: "anthropic", model: "test-model", liveAvailable: true, version: "test" } })
    );
    await page.route("**/api/interpret", (r) =>
      r.fulfill({
        json: {
          interpretation: { ...fixture, understood: ["Mocked model output for this test."] },
          meta: { provider: "anthropic", model: "test-model", latencyMs: 12, attempts: 1, inputTokens: 900, outputTokens: 400, estimatedCostUsd: 0.0116 }
        }
      })
    );
  });

  test("labels model output by model name and records usage", async ({ page }) => {
    await page.route("**/api/negotiate", (r) =>
      r.fulfill({
        json: {
          analysis: { kind: "climax-burst", creativeDifference: true, rationale: "Mocked rationale: hold six beats.", counter: { releaseMode: "held", holdBeats: 6 } },
          meta: { provider: "anthropic", model: "test-model", latencyMs: 20, attempts: 1, inputTokens: 500, outputTokens: 80, estimatedCostUsd: 0.0036 }
        }
      })
    );
    await fresh(page);
    await page.getByTestId("mode-live").click();
    await expect(page.getByTestId("mode-line")).toContainText("test-model");
    await composeExample(page);
    await expect(page.locator(".understood")).toContainText("Mocked model output");
    await expect(page.locator(".source-llm").first()).toContainText("test-model");
    await page.getByTestId("to-negotiate").click();
    await page.getByTestId("suggest-1").click();
    await page.getByTestId("send-request").click();
    await expect(page.getByTestId("round").first()).toContainText("Mocked rationale: hold six beats.");
    await expect(page.getByTestId("option-ai")).toContainText("6");
  });

  test("a model may phrase a rule-found objection but the rule sets the numbers", async ({ page }) => {
    let combineCalls = 0;
    await page.route("**/api/combine", (r) => {
      combineCalls++;
      return r.fulfill({ status: 500, json: {} });
    });
    await page.route("**/api/negotiate", (r) =>
      r.fulfill({
        json: {
          analysis: { kind: "more-chaos", creativeDifference: true, rationale: "Mocked rationale: keep the worst for the climax.", counter: null },
          meta: { provider: "anthropic", model: "test-model", latencyMs: 20, attempts: 1, inputTokens: 500, outputTokens: 80, estimatedCostUsd: 0.0036 }
        }
      })
    );
    await fresh(page);
    await page.getByTestId("mode-live").click();
    await composeExample(page);
    await page.getByTestId("to-negotiate").click();
    await page.getByTestId("suggest-6").click();
    await page.getByTestId("send-request").click();
    const round = page.getByTestId("round").first();
    await expect(round).toHaveAttribute("data-kind", "proposal");
    await expect(round).toContainText("Mocked rationale: keep the worst for the climax.");
    await expect(page.getByTestId("option-ai")).toContainText("order held at 0.2");
    await page.getByTestId("combine").click();
    await expect(page.getByTestId("option-combined")).toContainText("Order 0.125");
    expect(combineCalls).toBe(0); // the middle ground comes from the rules, not a model call
  });

  test("a failing model call falls back to rules and says so", async ({ page }) => {
    await page.route("**/api/negotiate", (r) => r.fulfill({ status: 502, json: { detail: { code: "invalid_model_output", detail: "bad" } } }));
    await fresh(page);
    await page.getByTestId("mode-live").click();
    await composeExample(page);
    await page.getByTestId("to-negotiate").click();
    await page.getByTestId("suggest-1").click();
    await page.getByTestId("send-request").click();
    await expect(page.getByTestId("round").first()).toContainText("rule-based fallback: Live AI failed (invalid_model_output)");
  });

  test("a failing interpretation is reported and nothing is invented", async ({ page }) => {
    await page.unroute("**/api/interpret");
    await page.route("**/api/interpret", (r) => r.fulfill({ status: 504, json: { detail: { code: "timeout", detail: "slow" } } }));
    await fresh(page);
    await page.getByTestId("mode-live").click();
    await page.locator(".example").first().click();
    await page.getByTestId("compose").click();
    await expect(page.getByRole("alert")).toContainText("timeout");
    await expect(page.locator(".app")).toHaveAttribute("data-stage", "imagine");
    await page.getByRole("button", { name: "Continue with demo rules instead" }).click();
    await expect(page.locator(".app")).toHaveAttribute("data-stage", "compose");
    await expect(page.locator(".source").first()).toContainText("demo rules");
  });
});
