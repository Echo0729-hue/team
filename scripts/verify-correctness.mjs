import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { chromium } from "playwright";

const port = Number(process.env.TEST_PORT ?? 4328);
const base = `http://127.0.0.1:${port}`;
const output = path.resolve("test-results/correctness");
fs.mkdirSync(output, { recursive: true });
const results = [];
const check = (label, condition) => {
  assert.ok(condition, label);
  results.push(label);
  console.log(`PASS ${label}`);
};
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let server;
let browser;
let context;
const stopServer = async () => {
  if (!server || server.exitCode !== null) return;
  if (process.platform === "win32") await promisify(execFile)("taskkill", ["/PID", String(server.pid), "/T", "/F"], { windowsHide: true }).catch(() => {});
  else server.kill("SIGTERM");
  server = null;
};
const startServer = async () => {
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port), "-H", "127.0.0.1"], {
    windowsHide: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" },
  });
  server.stderr.on("data", (data) => fs.appendFileSync(path.join(output, "server.log"), data));
  server.stdout.on("data", (data) => fs.appendFileSync(path.join(output, "server.log"), data));
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode !== null) throw Error("Test server exited; see server.log");
    try { if ((await fetch(base)).ok) return; } catch {}
    await delay(250);
  }
  throw Error("Test server did not become ready");
};
const post = async (route, body) => {
  const response = await fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { status: response.status, data: await response.json() };
};
const draft = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("codevideo:project:v1")).data);
const tab = (page, name) => page.getByRole("tab", { name, exact: true }).click();
const nav = (page, name) => page.locator(".sidebar .nav-item").filter({ hasText: name }).click();
const waitSaved = (page) => page.waitForFunction(() => !!localStorage.getItem("codevideo:project:v1"));

try {
  await startServer();
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : process.platform === "win32" ? { channel: "msedge" } : {}) });
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  let page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#title").fill("视频测试");
  await page.locator("#line0").fill("先填文案。");
  await page.locator("#line1").fill("再选择合适的模板。");
  await page.locator("#line2").fill("最后导出。");
  await nav(page, "素材库");
  await nav(page, "生成视频");
  check("switching pages retains unsaved editor input", await page.locator("#title").inputValue() === "视频测试");

  await tab(page, "图层");
  const imageFile = path.join(output, "upload.png");
  await page.screenshot({ path: imageFile });
  const uploadResponse = page.waitForResponse((response) => response.url().endsWith("/api/uploads") && response.request().method() === "POST");
  await page.locator('input[type="file"]').setInputFiles(imageFile);
  check("image upload succeeds", (await uploadResponse).status() === 201);
  await page.getByRole("button", { name: "添加到画面", exact: true }).first().click();
  await page.getByRole("button", { name: "+ 文字", exact: true }).click();
  await page.locator("#layer-text").fill("恢复后的图层");
  await page.locator('.inspector-card .field-grid.three').last().locator('input').nth(0).fill("32.1");
  await page.locator('.inspector-card .field-grid.three').last().locator('input').nth(1).fill("43.2");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("codevideo:project:v1")).data.layers.length === 2);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("#layer-text").waitFor();
  const recovered = await draft(page);
  check("refresh restores image, text and layer position", recovered.layers.length === 2 && recovered.layers[1].text === "恢复后的图层" && recovered.layers[1].x === 0.321 && recovered.layers[1].y === 0.432);

  await tab(page, "配音");
  await page.locator("#voice option").first().waitFor({ state: "attached" });
  await page.locator("#speed").fill("1.5");
  const ttsResponse = page.waitForResponse((response) => response.url().endsWith("/api/tts") && response.request().method() === "POST", { timeout: 120000 });
  await page.getByRole("button", { name: "生成配音", exact: true }).click();
  await nav(page, "素材库");
  console.log("Generating four measured narration scenes…");
  const audioResponse = await ttsResponse;
  const audioData = await audioResponse.json();
  check("narration request succeeds while navigating away", audioResponse.status() === 200 && !!audioData.tts);
  const tts = audioData.tts;
  check("four audio scenes have separate measured boundaries", tts.scenes.length === 4 && tts.scenes.every((scene, index) => scene.endFrame > scene.startFrame && (index === 0 || scene.startFrame >= tts.scenes[index - 1].endFrame)));
  check("narration fits the single clip limit", tts.durationSeconds <= 15);
  await nav(page, "生成视频");
  await page.getByRole("button", { name: "重新生成配音", exact: true }).waitFor();
  await tab(page, "字幕");
  await page.getByRole("textbox", { name: "第 1 屏字幕", exact: true }).fill("修改后的字幕");
  await page.locator("#font-scale").fill("1.2");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("codevideo:project:v1")).data.subtitleTexts[0] === "修改后的字幕");
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("textbox", { name: "第 1 屏字幕", exact: true }).waitFor();
  check("refresh reloads audio record and preserves subtitle edits", (await draft(page)).ttsId === tts.id && await page.getByRole("textbox", { name: "第 1 屏字幕", exact: true }).inputValue() === "修改后的字幕" && await page.locator("#font-scale").inputValue() === "1.2");

  await tab(page, "配音");
  const originalScript = await page.locator("#script").inputValue();
  await page.locator("#script").fill(originalScript.replace("先填文案", "先改文案"));
  check("stale narration disables every export button", await page.getByRole("button", { name: "导出视频", exact: true }).first().isDisabled());
  await tab(page, "内容");
  check("stale warning is visible outside voice tab", await page.getByRole("alert").filter({ hasText: "配音已过期" }).isVisible());
  await page.screenshot({ path: path.join(output, "desktop-stale.png"), fullPage: true });
  await tab(page, "配音");
  await page.locator("#script").fill(originalScript);
  await page.locator("#speed").fill("1.25");
  check("speed edits invalidate the audio", await page.getByRole("button", { name: "导出视频", exact: true }).first().isDisabled());
  await page.locator("#speed").fill("1.5");
  await tab(page, "内容");
  await page.locator("#line1").fill("正文已经更新。");
  check("visual content edits invalidate the audio", await page.getByRole("button", { name: "导出视频", exact: true }).first().isDisabled());
  await page.locator("#line1").fill("再选择合适的模板。");

  const valid = {
    title: "视频测试", lines: ["先填文案。", "再选择合适的模板。", "最后导出。"],
    backgroundColor: "#0B1120", accentColor: "#38BDF8", template: "quote", ratio: "9:16", durationInSeconds: 15,
    durationMode: "voice", narration: { enabled: true, ttsId: tts.id, script: tts.script, voiceId: tts.voiceId,
      speed: tts.speed, audioSrc: tts.audioUrl, audioDurationSeconds: tts.durationSeconds, volume: 0.9 },
    subtitles: { enabled: true, cues: tts.cues },
  };
  for (const [name, change] of [
    ["script", (p) => p.narration.script += "变更"],
    ["voice", (p) => p.narration.voiceId = "local:other"],
    ["speed", (p) => p.narration.speed = 1],
    ["content", (p) => p.lines[0] = "其他正文"],
  ]) {
    const payload = structuredClone(valid); change(payload);
    const response = await post("/api/render", payload);
    check(`server rejects stale ${name} even when UI is bypassed`, response.status === 409 && response.data.code === "TTS_STALE");
  }
  const missing = structuredClone(valid); missing.narration.ttsId = "b".repeat(20);
  check("server rejects missing audio", (await post("/api/render", missing)).status === 409);

  // Exercise real UI submission, then refresh while the task is still running.
  const renderResponse = page.waitForResponse((response) => response.url().endsWith("/api/render") && response.request().method() === "POST");
  await page.getByRole("button", { name: "导出视频", exact: true }).first().click();
  const submitted = await renderResponse;
  const created = await submitted.json();
  check("valid narration exports through the UI", submitted.status() === 202 && !!created.job);
  await page.waitForFunction((id) => JSON.parse(localStorage.getItem("codevideo:project:v1")).data.jobId === id, created.job.id);
  await page.reload({ waitUntil: "networkidle" });
  check("refresh retains the active render job id", (await draft(page)).jobId === created.job.id);
  console.log("Rendering narrated MP4…");
  let finished;
  for (let attempt = 0; attempt < 180; attempt++) {
    const job = (await (await fetch(`${base}/api/jobs/${created.job.id}`)).json()).job;
    if (["success", "failed"].includes(job.status)) { finished = job; break; }
    await delay(1000);
  }
  check("narrated MP4 finishes successfully", finished?.status === "success");
  check("job uses measured scene starts and subtitle intervals", JSON.stringify(finished.props.narration.scenes) === JSON.stringify(tts.scenes) && finished.props.subtitles.cues[1].startFrame === tts.cues[1].startFrame);
  const video = await fetch(base + finished.videoUrl);
  check("rendered video can be downloaded", video.status === 200 && (await video.arrayBuffer()).byteLength > 10000);
  fs.writeFileSync(path.join(output, "render-job.json"), JSON.stringify(finished, null, 2));
  await page.screenshot({ path: path.join(output, "desktop-restored.png"), fullPage: true });
  const storage = await context.storageState();
  await context.close();
  await stopServer();
  await startServer();
  context = await browser.newContext({ storageState: storage, viewport: { width: 1440, height: 1000 } });
  page = await context.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await page.locator("#title").waitFor();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("codevideo:project:v1")).data.jobId === null);
  check("browser and server restart restore draft and release missing job", await page.locator("#title").inputValue() === "视频测试" && (await draft(page)).layers.length === 2);
  check("saved audio remains available after server restart", (await fetch(`${base}/api/tts/${tts.id}`)).status === 200);

  // Resource loss must keep the draft and prevent stale export.
  await page.route(`**/api/tts/${tts.id}`, (route) => route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ message: "配音文件已失效，请重新生成配音。" }) }));
  await page.reload({ waitUntil: "networkidle" });
  await tab(page, "配音");
  check("missing restored audio preserves text and blocks export", (await draft(page)).script === originalScript && await page.getByRole("button", { name: "导出视频", exact: true }).first().isDisabled());

  const mobile = await context.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(base, { waitUntil: "networkidle" });
  await mobile.screenshot({ path: path.join(output, "mobile.png"), fullPage: true });
  check("mobile layout fits the 390px viewport", await mobile.evaluate(() => innerWidth === 390 && document.documentElement.scrollWidth === innerWidth));

  const corrupt = await browser.newContext();
  const bad = await corrupt.newPage();
  await bad.addInitScript(() => localStorage.setItem("codevideo:project:v1", "{broken"));
  await bad.goto(base, { waitUntil: "networkidle" });
  check("corrupt drafts are preserved and reported", await bad.getByRole("status").filter({ hasText: "草稿读取失败" }).isVisible() && await bad.evaluate(() => localStorage.getItem("codevideo:project:v1")) === "{broken");
  await corrupt.close();
  check("no browser runtime errors", errors.length === 0);
  fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify({ passed: results, errors, audio: tts, jobId: finished.id }, null, 2));
  fs.rmSync(path.join(output, "failure.txt"), { force: true });
  console.log(`All ${results.length} browser/API checks passed.`);
} catch (error) {
  fs.writeFileSync(path.join(output, "failure.txt"), error.stack ?? String(error));
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser?.close();
  await stopServer();
}
