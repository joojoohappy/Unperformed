#!/usr/bin/env node
// Captures the README screenshots and the demo video from the running app.
//
//   pnpm media                 -> everything (about 15 minutes on a 4-core CPU)
//   pnpm media -- screenshots  -> screenshots only
//   pnpm media -- video        -> video only
//
// Nothing here is drawn or mocked: every image is a screenshot of the studio
// served by Vite, driven through its real UI in demo mode (no AI model).
//
// Screenshots run in real time. The video is stepped frame by frame with
// Playwright's virtual clock, because headless Chromium renders WebGL on the
// CPU (SwiftShader) and cannot reach real time; stepping gives every frame the
// exact timeline position it would have at 30 fps. The audio track is rendered
// by the app's own audio engine (renderOffline) from the same score and muxed
// in, with the same gain change the app applies during a blackout. Because the
// frame rate the app measures under a virtual clock means nothing, the FPS
// readouts are hidden in the video only. Real frame rates are in
// docs/evaluation (pnpm bench:browser).
import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { root } from "./lib/bundle-core.mjs";

const web = join(root, "apps", "web");
const out = join(root, "assets", "demo");
const shotsDir = join(out, "screenshots");
const tmp = join(root, "scripts", ".media-tmp");
const PORT = 5181;
const BASE = `http://127.0.0.1:${PORT}/`;
const FPS = 30;
const only = process.argv[2];

const { chromium } = createRequire(join(web, "package.json"))("@playwright/test");
const ffmpeg = (args) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "inherit" });

const SESSION_KEY = "unperformed.session.v1";
const PREFS_KEY = "unperformed.prefs.v1";
const EXPLODE = "I want everything to explode at the climax.";

// ---------------------------------------------------------------- server

async function startServer() {
  const server = spawn("pnpm", ["exec", "vite", "--port", String(PORT), "--strictPort", "--host", "127.0.0.1"], { cwd: web, stdio: "ignore" });
  for (let i = 0; i < 120; i++) {
    try {
      if ((await fetch(BASE)).ok) return server;
    } catch {
      // not listening yet
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  server.kill();
  throw new Error("vite dev server did not start");
}

const LAUNCH = { args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--autoplay-policy=no-user-gesture-required", "--font-render-hinting=none"] };

async function freshPage(browser, { viewport, deviceScaleFactor = 1, query = "", sound = true, isMobile = false, hasTouch = false }) {
  const context = await browser.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch, reducedMotion: "no-preference" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  await page.goto(BASE + query);
  await page.evaluate(
    ([key, prefs]) => {
      localStorage.clear();
      localStorage.setItem(key, JSON.stringify(prefs));
    },
    [PREFS_KEY, { reducedMotion: false, sound }]
  );
  await page.goto(BASE + query);
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.evaluate(() => document.fonts.ready);
  return { page, context, errors };
}

async function approveAll(page, label = "Approve") {
  const approve = page.getByRole("button", { name: label, exact: true });
  while (await approve.count()) await approve.first().click();
}

async function readScore(page) {
  return page.evaluate((key) => JSON.parse(localStorage.getItem(key)).score, SESSION_KEY);
}

function climaxReleaseSeconds(score) {
  const c = score.sections.find((s) => s.archetype === "climax");
  if (!c) return (score.totalBeats * 0.7 * 60) / score.tempoBpm;
  const hold = c.release && c.release.mode !== "immediate" ? c.release.holdBeats : 0;
  return ((c.startBeat + hold) * 60) / score.tempoBpm;
}

// ---------------------------------------------------------------- screenshots

async function screenshots(browser) {
  rmSync(shotsDir, { recursive: true, force: true });
  mkdirSync(shotsDir, { recursive: true });
  const shot = async (page, name, opts = {}) => {
    // A full-page shot of a scrolled page would draw the sticky header mid-page.
    if (opts.fullPage) await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(shotsDir, name), ...opts });
  };
  const desktop = { viewport: { width: 1440, height: 900 } };

  const { page, context, errors } = await freshPage(browser, desktop);
  await shot(page, "01-landing-imagine.png");

  await page.locator("#intent").fill((await page.locator(".example").first().innerText()).trim());
  await page.locator(".intent-options select").selectOption("tense");
  await shot(page, "02-intent-input.png");

  await page.getByTestId("compose").click();
  await page.locator(".section-row").first().waitFor();
  await approveAll(page);
  await page.waitForTimeout(400);
  await shot(page, "03-performance-score.png", { fullPage: true });

  await page.getByTestId("to-negotiate").click();
  await page.locator("#request").fill(EXPLODE);
  await page.getByTestId("send-request").click();
  await page.getByTestId("combine").click();
  await page.getByTestId("option-combined").waitFor();
  await page.waitForTimeout(300);
  await shot(page, "04-negotiation.png", { fullPage: true });
  await page.getByTestId("choose-ai").click();

  await page.getByTestId("to-rehearse").click();
  await page.getByTestId("camera-select").selectOption("pull-back");
  await page.waitForTimeout(1500);
  await shot(page, "05-rehearsal.png");

  // Live performance in real time, taken just after the climax releases.
  await page.getByTestId("to-perform").click();
  const score = await readScore(page);
  await page.getByTestId("begin").click();
  await page.waitForTimeout((climaxReleaseSeconds(score) + 1.2) * 1000);
  await shot(page, "06-live-performance.png");
  await page.getByTestId("stop").click();
  await page.getByTestId("to-review").click();
  await page.getByTestId("history").waitFor();
  await page.waitForTimeout(300);
  await shot(page, "07-review.png", { fullPage: true });
  await context.close();

  // Traditional Chinese negotiation.
  {
    const { page, context, errors: e2 } = await freshPage(browser, { ...desktop, query: "?lang=zh-TW" });
    await page.locator(".example").first().click();
    await page.getByTestId("compose").click();
    await approveAll(page, "核准");
    await page.getByTestId("to-negotiate").click();
    await page.getByTestId("suggest-1").click();
    await page.getByTestId("send-request").click();
    await page.getByTestId("combine").click();
    await page.getByTestId("option-combined").waitFor();
    await page.waitForTimeout(300);
    await shot(page, "08-negotiation-zh-TW.png", { fullPage: true });
    errors.push(...e2);
    await context.close();
  }

  // Phone width.
  {
    const { page, context, errors: e3 } = await freshPage(browser, { viewport: { width: 412, height: 915 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.locator(".example").first().click();
    await page.getByTestId("compose").click();
    await page.locator(".section-row").first().waitFor();
    await page.waitForTimeout(300);
    await shot(page, "09-mobile-score.png");
    errors.push(...e3);
    await context.close();
  }

  if (errors.length) throw new Error(`console errors during capture:\n${errors.join("\n")}`);
  // Lossless size pass.
  for (const f of ["01-landing-imagine", "02-intent-input", "03-performance-score", "04-negotiation", "05-rehearsal", "06-live-performance", "07-review", "08-negotiation-zh-TW", "09-mobile-score"]) {
    const p = join(shotsDir, `${f}.png`);
    execFileSync("convert", [p, "-strip", "-define", "png:compression-level=9", p]);
  }
  console.log(`screenshots → ${shotsDir}`);
}

// ---------------------------------------------------------------- video

class Recorder {
  constructor(page, dir) {
    this.page = page;
    this.dir = dir;
    this.n = 0;
    this.t = 0;
    this.list = [];
    this.captions = [];
    this.open = null;
  }
  /** Take one frame and hold it for `seconds` of video time. */
  async hold(seconds) {
    const file = join(this.dir, `f${String(this.n++).padStart(5, "0")}.jpg`);
    await this.page.screenshot({ path: file, type: "jpeg", quality: 92 });
    this.list.push({ file, seconds });
    this.t += seconds;
  }
  caption(en, zh) {
    this.endCaption();
    this.open = { start: this.t, en, zh };
  }
  endCaption() {
    if (this.open) this.captions.push({ ...this.open, end: this.t });
    this.open = null;
  }
  /** Type into a field in chunks, one frame per chunk. */
  async type(locator, text, chunk = 3, perChunk = 0.05) {
    await locator.fill("");
    for (let i = chunk; i < text.length + chunk; i += chunk) {
      await locator.fill(text.slice(0, i));
      await this.hold(perChunk);
    }
  }
}

const HIDE_FPS = `
  .hud-left .muted { visibility: hidden !important; }
  .unperformed-capture-hidden { visibility: hidden !important; }
`;

async function video(browser) {
  rmSync(tmp, { recursive: true, force: true });
  const framesDir = join(tmp, "frames");
  mkdirSync(framesDir, { recursive: true });
  const { page, context, errors } = await freshPage(browser, { viewport: { width: 1280, height: 720 }, sound: false });
  await page.addStyleTag({ content: HIDE_FPS });
  const rec = new Recorder(page, framesDir);

  // IMAGINE
  rec.caption("UNPERFORMED: imagine something, then direct its existence.", "UNPERFORMED：想像一件事，然後導演它的存在。");
  await rec.hold(1.6);
  rec.caption("IMAGINE: write the idea in plain language. Demo mode uses deterministic rules; no AI model is called.", "想像：用自然語言寫下構想。示範模式使用確定性規則，不呼叫 AI 模型。");
  const idea = (await page.locator(".example").first().innerText()).trim();
  await rec.type(page.locator("#intent"), idea);
  await page.getByRole("button", { name: /Standard/ }).click();
  await rec.hold(1.2);

  // COMPOSE
  await page.getByTestId("compose").click();
  await page.locator(".section-row").first().waitFor();
  await page.waitForTimeout(250);
  rec.caption("COMPOSE: the idea becomes a typed, validated Performance Score.", "編排：構想成為有型別、經過驗證的 Performance Score。");
  await rec.hold(3.0);
  const constraints = page.locator(".constraint").first();
  await constraints.scrollIntoViewIfNeeded();
  rec.caption("Constraints stay proposals until a human approves them.", "限制條件在人類核准之前，都只是提議。");
  await rec.hold(1.4);
  await approveAll(page);
  await page.waitForTimeout(200);
  await rec.hold(1.6);

  // NEGOTIATE
  await page.getByTestId("to-negotiate").click();
  await page.locator("#request").waitFor();
  rec.caption("NEGOTIATE: ask for a change in your own words.", "協商：用自己的話提出修改。");
  await rec.type(page.locator("#request"), EXPLODE, 4, 0.05);
  await rec.hold(0.4);
  await page.getByTestId("send-request").click();
  const round = page.getByTestId("round").first();
  await round.waitFor();
  await round.scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  rec.caption("The director objects once, with a reason: hold the light back for 8 beats first.", "導演提出一次有理由的反對：先把燈光壓住 8 拍。");
  await rec.hold(3.6);
  await page.getByTestId("combine").click();
  await page.getByTestId("option-combined").waitFor();
  await page.getByTestId("option-combined").scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  rec.caption("Or combine both ideas. Every option shows exactly what it changes.", "也可以合併兩個想法。每個選項都列出確切的改動。");
  await rec.hold(2.6);
  await page.getByTestId("choose-ai").click();
  await page.waitForTimeout(250);
  rec.caption("The human decides. Authority rules are enforced by deterministic code, not by the model.", "由人類決定。權限規則由確定性程式碼執行，而非模型。");
  await rec.hold(2.4);

  // REHEARSE
  await page.getByTestId("to-rehearse").click();
  await page.locator(".stage canvas").waitFor();
  await page.waitForTimeout(1200);
  rec.caption("REHEARSE: scrub the timeline and adjust any section by hand.", "排練：拖動時間軸，親手調整任何段落。");
  await rec.hold(1.8);
  await page.getByTestId("camera-select").selectOption("pull-back");
  await page.waitForTimeout(900);
  await rec.hold(1.6);

  // PERFORM: stepped with a virtual clock, one frame every 1/30 s.
  await page.getByTestId("to-perform").click();
  await page.getByTestId("begin").waitFor();
  await page.waitForTimeout(600);
  rec.caption("PERFORM: a real-time 3D stage with procedural audio.", "演出：即時 3D 舞台與程序化音訊。");
  await rec.hold(0.6);
  const score = await readScore(page);
  const seconds = (score.totalBeats * 60) / score.tempoBpm;
  const release = climaxReleaseSeconds(score);
  const blackoutAt = Math.max(6, Math.round(release * 0.45));
  await page.clock.install();
  await page.clock.pauseAt(Date.now() + 1000);
  await page.getByTestId("begin").click();
  const performStart = rec.t;
  let blackout = null;
  const frameCount = Math.ceil(seconds * FPS) + 2;
  for (let i = 0; i < frameCount; i++) {
    const s = i / FPS;
    if (Math.abs(s - (blackoutAt - 1)) < 1e-6) rec.caption("A human can step in at any moment: blackout, pause, master intensity.", "人類可以隨時介入：全黑、暫停、主亮度。");
    if (Math.abs(s - blackoutAt) < 1e-6) {
      await page.keyboard.press("b");
      blackout = { start: rec.t };
    }
    if (Math.abs(s - (blackoutAt + 2.5)) < 1e-6) {
      await page.keyboard.press("b");
      blackout.end = rec.t;
    }
    if (Math.abs(s - (blackoutAt + 4)) < 1e-6) rec.endCaption();
    if (Math.abs(s - Math.round((release - 3.5) * FPS) / FPS) < 1e-6) rec.caption("The climax holds the light back, then releases: the choice made in negotiation.", "高潮先壓住燈光，再釋放：正是協商時做的選擇。");
    if (Math.abs(s - Math.round((release + 4) * FPS) / FPS) < 1e-6) rec.endCaption();
    if (Math.abs(s - Math.round((seconds - 9) * FPS) / FPS) < 1e-6) rec.caption("The ending the human locked: complete silence.", "人類鎖定的結尾：完全的寂靜。");
    await page.clock.runFor(1000 / FPS);
    await rec.hold(1 / FPS);
    if (i % 150 === 0) process.stdout.write(`  perform frame ${i}/${frameCount}\n`);
  }
  await page.getByTestId("perform-ended").waitFor();
  rec.endCaption();
  await rec.hold(0.5);

  // REVIEW
  await page.getByTestId("to-review").click();
  await page.getByTestId("history").waitFor();
  await page.evaluate(() => {
    // The frame rate recorded under a virtual clock is not a real measurement: hide it in the video.
    for (const dt of document.querySelectorAll("[data-testid=telemetry] dt")) {
      if (/frame|fps|幀/i.test(dt.textContent ?? "")) {
        dt.classList.add("unperformed-capture-hidden");
        dt.nextElementSibling?.classList.add("unperformed-capture-hidden");
      }
    }
  });
  await page.waitForTimeout(300);
  rec.caption("REVIEW: a factual record of who decided what, and what changed.", "回顧：誰決定了什麼、改了什麼的事實紀錄。");
  await rec.hold(2.4);
  rec.caption("Captured from the running app in demo mode. github.com/joojoohappy/Unperformed", "畫面擷取自實際執行中的應用程式（示範模式）。");
  await rec.hold(1.8);
  rec.endCaption();

  // Audio: rendered by the app's own engine from the same score.
  const wavB64 = await page.evaluate(async (key) => {
    const { renderOffline, encodeWav } = await import("/src/audio/engine.ts");
    const s = JSON.parse(localStorage.getItem(key)).score;
    const bytes = encodeWav(await renderOffline(s));
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }, SESSION_KEY);
  const wav = join(tmp, "score.wav");
  writeFileSync(wav, Buffer.from(wavB64, "base64"));
  await context.close();
  if (errors.length) throw new Error(`console errors during capture:\n${errors.join("\n")}`);

  // Assemble.
  const concat = rec.list.map((f) => `file '${f.file}'\nduration ${f.seconds.toFixed(5)}`).join("\n") + `\nfile '${rec.list.at(-1).file}'\n`;
  writeFileSync(join(tmp, "frames.txt"), concat);
  writeCaptions(rec.captions, rec.t);
  const total = rec.t;
  const delay = Math.round(performStart * 1000);
  const quiet = 0.25 / 0.9; // the app's blackout gain relative to normal
  const audioFilter = [
    `[1:a]atrim=0:${seconds.toFixed(3)}`,
    `afade=t=out:st=${(seconds - 0.4).toFixed(3)}:d=0.4`,
    `adelay=${delay}|${delay}`,
    blackout ? `volume=${quiet.toFixed(4)}:enable='between(t,${blackout.start.toFixed(3)},${blackout.end.toFixed(3)})'` : null,
    `apad`,
    `atrim=0:${total.toFixed(3)}[a]`
  ]
    .filter(Boolean)
    .join(",");
  const ass = join(tmp, "captions.ass").replaceAll("\\", "/");
  const mp4 = join(out, "unperformed-demo.mp4");
  ffmpeg([
    "-f", "concat", "-safe", "0", "-i", join(tmp, "frames.txt"),
    "-i", wav,
    "-filter_complex", `[0:v]fps=${FPS},pad=1280:800:0:0:color=0x0b0b0c,subtitles='${ass}'[v];${audioFilter}`,
    "-map", "[v]", "-map", "[a]",
    "-c:v", "libx264", "-preset", "slow", "-crf", "27", "-pix_fmt", "yuv420p", "-tune", "animation",
    "-c:a", "aac", "-b:a", "128k",
    "-movflags", "+faststart",
    "-t", total.toFixed(3),
    mp4
  ]);
  // Poster and animated preview: negotiation, then the climax release.
  const negotiation = rec.captions.find((c) => c.en.startsWith("The director objects"));
  const climaxCap = rec.captions.find((c) => c.en.startsWith("The climax"));
  ffmpeg(["-ss", (performStart + release + 0.8).toFixed(2), "-i", mp4, "-frames:v", "1", "-q:v", "3", join(out, "unperformed-demo-poster.jpg")]);
  ffmpeg([
    "-i", mp4,
    "-filter_complex",
    `[0:v]trim=${negotiation.start.toFixed(2)}:${(negotiation.start + 3).toFixed(2)},setpts=PTS-STARTPTS[a];` +
      `[0:v]trim=${(climaxCap.start + 1).toFixed(2)}:${(climaxCap.start + 8).toFixed(2)},setpts=PTS-STARTPTS[b];` +
      `[a][b]concat=n=2:v=1,fps=12,scale=720:-2:flags=lanczos[v]`,
    "-map", "[v]", "-c:v", "libwebp_anim", "-quality", "62", "-compression_level", "6", "-loop", "0",
    join(out, "unperformed-demo-preview.webp")
  ]);
  writeFileSync(
    join(out, "capture-manifest.json"),
    JSON.stringify(
      {
        capturedAt: new Date().toISOString(),
        app: "apps/web via vite dev server, demo mode (no AI model)",
        browser: `Chromium ${browser.version()} headless, WebGL via SwiftShader`,
        video: { width: 1280, height: 800, appViewport: "1280x720", fps: FPS, seconds: +total.toFixed(2), performSeconds: seconds, method: "frame-stepped with Playwright clock; FPS readouts hidden" },
        audio: "rendered offline by apps/web/src/audio/engine.ts renderOffline() from the same score; blackout gain applied as in the app",
        captions: ["unperformed-demo.en.srt", "unperformed-demo.zh-TW.srt", "burned in: English + Traditional Chinese"]
      },
      null,
      2
    ) + "\n"
  );
  console.log(`video → ${mp4} (${total.toFixed(1)} s)`);
}

function writeCaptions(captions, total) {
  const ts = (s, sep) => {
    const ms = Math.round(s * 1000);
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}${sep}${String(ms % 1000).padStart(3, "0")}`;
  };
  const cues = captions.filter((c) => c.end - c.start > 0.3).map((c) => ({ ...c, end: Math.min(c.end, total) }));
  for (const [lang, field] of [["en", "en"], ["zh-TW", "zh"]]) {
    const srt = cues.map((c, i) => `${i + 1}\n${ts(c.start, ",")} --> ${ts(c.end, ",")}\n${c[field]}\n`).join("\n");
    writeFileSync(join(out, `unperformed-demo.${lang}.srt`), srt);
    writeFileSync(join(out, `unperformed-demo.${lang}.vtt`), "WEBVTT\n\n" + srt.replace(/(\d\d:\d\d:\d\d),(\d\d\d)/g, "$1.$2"));
  }
  const assTime = (s) => {
    const cs = Math.round(s * 100);
    return `${Math.floor(cs / 360000)}:${String(Math.floor((cs % 360000) / 6000)).padStart(2, "0")}:${String(Math.floor((cs % 6000) / 100)).padStart(2, "0")}.${String(cs % 100).padStart(2, "0")}`;
  };
  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1280
PlayResY: 800
WrapStyle: 0
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: En,Inter,23,&H00F2F0EC,&H00F2F0EC,&H000B0B0C,&H000B0B0C,0,0,0,0,100,100,0,0,1,0,0,2,40,40,44,1
Style: Zh,WenQuanYi Zen Hei,20,&H00A9A49C,&H00A9A49C,&H000B0B0C,&H000B0B0C,0,0,0,0,100,100,0,0,1,0,0,2,40,40,14,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const lines = cues.flatMap((c) => [
    `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},En,,0,0,0,,${c.en}`,
    `Dialogue: 0,${assTime(c.start)},${assTime(c.end)},Zh,,0,0,0,,${c.zh}`
  ]);
  writeFileSync(join(tmp, "captions.ass"), header + lines.join("\n") + "\n");
}

// ---------------------------------------------------------------- main

mkdirSync(out, { recursive: true });
const server = await startServer();
const browser = await chromium.launch(LAUNCH);
try {
  if (!only || only === "screenshots") await screenshots(browser);
  if (!only || only === "video") await video(browser);
} finally {
  await browser.close();
  server.kill();
}
if (existsSync(tmp) && !process.env.KEEP_MEDIA_TMP) rmSync(tmp, { recursive: true, force: true });
