import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

// Run against a local development instance; only test-created uploads/videos are deleted.
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const output = path.resolve("test-results/site");
fs.mkdirSync(output, { recursive: true });
const passed = [];
const check = (name, ok) => { assert.ok(ok, name); passed.push(name); console.log(`PASS ${name}`); };
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const request = async (route, method = "GET", body) => {
  const response = await fetch(base + route, { method, ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  return { status: response.status, data: await response.json() };
};
const waitJob = async (id) => {
  for (let attempt = 0; attempt < 240; attempt++) {
    const { data } = await request(`/api/jobs/${id}`);
    if (["success", "failed"].includes(data.job.status)) return data.job;
    await delay(500);
  }
  throw Error(`Render timed out: ${id}`);
};
const nav = (page, name) => page.locator(".sidebar .nav-item").filter({ hasText: name }).click();
const tab = (page, name) => page.getByRole("tab", { name: new RegExp(`^${name}`) }).click();
let browser;
const created = [];
const errors = [];
let createdUpload;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : process.platform === "win32" ? { channel: "msedge" } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  const page = await context.newPage();
  await page.goto(base, { waitUntil: "networkidle" });
  await nav(page, "素材库");
  await page.getByRole("heading", { name: "素材库", exact: true }).waitFor();
  await page.goBack();
  await page.locator("#title").waitFor();
  check("browser back follows workspace navigation", await page.locator("#title").isVisible());

  await tab(page, "配音");
  await page.locator("#voice option").first().waitFor({ state: "attached" });
  const voiceId = await page.locator("#voice").inputValue();
  const content = { title: "视频测试", lines: ["先填文案。", "再选择合适的模板。", "最后导出。"] };
  const script = [content.title + "。", ...content.lines].join("\n");
  const audio = await request("/api/tts", "POST", { content, script, voiceId, speed: 1.5 });
  check("real four-scene narration is available", audio.status === 200 && audio.data.tts.scenes.length === 4);
  const tts = audio.data.tts;
  const wav = await fetch(base + tts.audioUrl + "?download=1");
  check("audio download has a WAV filename", wav.headers.get("content-disposition").endsWith(".wav"));
  await wav.arrayBuffer();
  const suffix = await fetch(base + tts.audioUrl, { headers: { Range: "bytes=-10" } });
  check("audio suffix range returns exactly ten bytes", suffix.status === 206 && (await suffix.arrayBuffer()).byteLength === 10);
  const badRange = await fetch(base + tts.audioUrl, { headers: { Range: "bytes=1-999999999999999999999" } });
  check("unsafe media range receives 416", badRange.status === 416);
  check("literal percent in image route gets validation error", (await request("/api/uploads/%25")).status === 400);
  check("upload metadata is not served as an image", (await request("/api/uploads/not-an-image.json")).status === 400);

  // Restore a realistic editor draft, then verify the downloaded text and modal playback.
  await page.addInitScript(({ tts, content, script }) => {
    if (sessionStorage.getItem("site:seeded")) return;
    const saved = JSON.parse(localStorage.getItem("codevideo:project:v1"));
    Object.assign(saved.data, { voiceEnabled: true, ttsId: tts.id, voiceId: tts.voiceId, speed: tts.speed,
      script, scriptTouched: true, durationMode: "voice", subtitleEnabled: true, subtitleTexts: ["已修正的下载字幕"], tab: "subtitle" });
    Object.assign(saved.data.values, { title: content.title, line0: content.lines[0], line1: content.lines[1], line2: content.lines[2] });
    localStorage.setItem("codevideo:project:v1", JSON.stringify(saved));
    sessionStorage.setItem("site:seeded", "1");
  }, { tts, content, script });
  await page.reload({ waitUntil: "networkidle" });
  const link = page.getByRole("link", { name: "下载 SRT", exact: true }).first();
  await page.waitForFunction(() => document.querySelector('a[download$=".srt"]')?.href.startsWith("blob:"));
  const downloadPromise = page.waitForEvent("download");
  await link.click();
  const download = await downloadPromise;
  const srtPath = path.join(output, "edited.srt");
  await download.saveAs(srtPath);
  check("downloaded SRT contains current edited subtitles", fs.readFileSync(srtPath, "utf8").includes("已修正的下载字幕"));
  await page.getByRole("button", { name: "放大预览", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.waitFor();
  check("preview dialog moves keyboard focus inside", await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
  check("enlarged preview pauses underlying narration", await page.locator('.canvas audio').evaluateAll((nodes) => nodes.every((node) => node.paused)));
  for (let press = 0; press < 18; press++) await page.keyboard.press("Tab");
  check("preview dialog keeps tab focus inside", await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]')));
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });

  await tab(page, "图层");
  await page.getByRole("button", { name: "+ 文字", exact: true }).click();
  await page.locator("#layer-text").fill("拖动测试");
  await page.waitForFunction(() => JSON.parse(localStorage.getItem("codevideo:project:v1")).data.layers.length === 1);
  const box = page.locator('.layer-box.selected');
  await box.waitFor();
  await box.dispatchEvent("pointerdown", { pointerId: 71, button: 0, clientX: 700, clientY: 400 });
  const initial = await page.evaluate(() => JSON.parse(localStorage.getItem("codevideo:project:v1")).data.layers.at(-1).x);
  await box.dispatchEvent("pointermove", { pointerId: 72, clientX: 950, clientY: 400 });
  await delay(300);
  check("second pointer cannot take over an active layer drag", await page.evaluate((x) => JSON.parse(localStorage.getItem("codevideo:project:v1")).data.layers.at(-1).x === x, initial));
  await box.dispatchEvent("pointercancel", { pointerId: 71 });
  await box.dispatchEvent("pointerdown", { pointerId: 73, button: 0, clientX: 700, clientY: 400 });
  await box.dispatchEvent("pointermove", { pointerId: 73, clientX: 720, clientY: 410 });
  await box.dispatchEvent("pointerup", { pointerId: 73 });
  await delay(300);
  check("drag works after pointer cancellation", await page.evaluate((x) => JSON.parse(localStorage.getItem("codevideo:project:v1")).data.layers.at(-1).x !== x, initial));
  const changed = await page.evaluate(() => JSON.parse(localStorage.getItem("codevideo:project:v1")).data.layers.at(-1).x);
  await box.dispatchEvent("pointerdown", { pointerId: 74, button: 0, clientX: 700, clientY: 400 });
  await page.evaluate(() => window.dispatchEvent(new Event("blur")));
  await box.dispatchEvent("pointermove", { pointerId: 74, clientX: 900, clientY: 400 });
  await delay(300);
  check("window blur releases the active layer drag", await page.evaluate((x) => JSON.parse(localStorage.getItem("codevideo:project:v1")).data.layers.at(-1).x === x, changed));
  for (let count = 1; count < 21; count++) await page.getByRole("button", { name: "+ 文字", exact: true }).click();
  check("editor enforces the twenty-layer export limit", await page.locator('.layer-row').count() === 20 && await page.getByRole("alert").filter({ hasText: "最多添加 20 个图层" }).isVisible());

  const edgeContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const edgeDraft = await page.evaluate(() => JSON.parse(localStorage.getItem("codevideo:project:v1")));
  Object.assign(edgeDraft.data, { layers: [], selectedLayerId: null, voiceEnabled: false, tab: "visual" });
  edgeDraft.data.values.durationInSeconds = 15;
  await edgeContext.addInitScript((draft) => {
    if (!localStorage.getItem("codevideo:project:v1")) localStorage.setItem("codevideo:project:v1", JSON.stringify(draft));
  }, edgeDraft);
  const edgePage = await edgeContext.newPage();
  edgePage.on("pageerror", (error) => errors.push(error.message));
  await edgePage.goto(base, { waitUntil: "networkidle" });
  check("turning narration off unlocks fixed video duration", await edgePage.locator('.duration-inputs input').isEnabled());
  await tab(edgePage, "图层");
  const imageResponse = edgePage.waitForResponse((r) => r.url().endsWith("/api/uploads") && r.request().method() === "POST");
  const testImageName = `site-aspect-${Date.now()}.png`;
  await edgePage.locator('input[type="file"]').setInputFiles({ name: testImageName, mimeType: "image/png", buffer: await edgePage.screenshot({ clip: { x: 0, y: 0, width: 160, height: 80 } }) });
  const uploaded = await (await imageResponse).json();
  createdUpload = uploaded.upload;
  check("valid PNG upload still succeeds", !!uploaded.upload);
  const asset = edgePage.locator('.upload-item').filter({ hasText: testImageName });
  await asset.getByRole("button", { name: "添加到画面", exact: true }).click();
  for (const [ratio, width, height] of [["9:16", 1080, 1920], ["16:9", 1920, 1080], ["1:1", 1080, 1080], ["4:5", 1080, 1350], ["4:3", 1440, 1080]]) {
    await tab(edgePage, "画面");
    await edgePage.getByRole("radio", { name: new RegExp(`^${ratio}`) }).click();
    await tab(edgePage, "图层");
    const widthInput = edgePage.locator('.inspector .num-field').filter({ hasText: /^宽度/ }).locator('input');
    await widthInput.fill("50");
    await widthInput.fill("60");
    await edgePage.waitForFunction(({ width, height }) => {
      const layer = JSON.parse(localStorage.getItem("codevideo:project:v1")).data.layers.find((item) => item.kind === "image");
      return Boolean(layer) && Math.abs(layer.width * width / (layer.height * height) - 2) < 0.001;
    }, { width, height });
    check(`image inspector preserves 2:1 aspect on ${ratio}`, true);
  }
  await asset.getByRole("button", { name: `删除图片 ${testImageName}`, exact: true }).click();
  check("image deletion explains when a layer still uses it", await edgePage.getByRole("alert").filter({ hasText: "图片仍在当前画面中使用" }).isVisible());
  await edgePage.locator('.layer-row button[title="删除图层"]').click();
  edgePage.once("dialog", (dialog) => dialog.accept());
  const deleteResponse = edgePage.waitForResponse((r) => r.url().endsWith(uploaded.upload.url) && r.request().method() === "DELETE");
  await asset.getByRole("button", { name: `删除图片 ${testImageName}`, exact: true }).click();
  check("unused image can be deleted to free an upload slot", (await deleteResponse).status() === 200);
  await edgeContext.close();

  // Real exports cover all six compositions, with one using subtitles and narration.
  for (const [index, template] of ["tech", "editorial", "cards", "split", "quote", "kinetic"].entries()) {
    const narrated = template === "quote";
    const response = await request("/api/render", "POST", { ...content, backgroundColor: "#0B1120", accentColor: "#38BDF8",
      template, ratio: ["9:16", "16:9", "1:1", "4:5", "4:3", "9:16"][index], durationInSeconds: 5, name: `网站回归-${template}-${Date.now()}`,
      ...(narrated ? { durationMode: "voice", narration: { enabled: true, ttsId: tts.id, script, voiceId, speed: 1.5,
        audioSrc: tts.audioUrl, audioDurationSeconds: tts.durationSeconds, volume: 0.9 }, subtitles: { enabled: true, cues: tts.cues } } : {}) });
    check(`${template} template accepts export`, response.status === 202);
    created.push(response.data.job.id);
    const job = await waitJob(response.data.job.id);
    check(`${template} template renders a real MP4`, job.status === "success");
  }

  const library = (await request("/api/library")).data.items;
  const a = library.find((item) => item.id === created[4]);
  const b = library.find((item) => item.id === created[0]);
  const pair = [a.id, b.id];
  await page.evaluate((pair) => localStorage.setItem("codevideo:merge:selection", JSON.stringify(pair)), pair);
  await nav(page, "视频拼接");
  await page.locator('.segment-row').nth(1).waitFor();
  await page.locator("#merge-ratio").selectOption("16:9");
  await page.getByRole("button", { name: "背景色 #0F766E", exact: true }).click();
  await page.reload({ waitUntil: "networkidle" });
  check("merge settings survive refresh", await page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem("codevideo:merge:project:v1"));
    return saved.ratio === "16:9" && saved.background === "#0F766E";
  }));
  const mergeResponse = page.waitForResponse((response) => response.url().endsWith("/api/merge") && response.request().method() === "POST");
  await page.getByRole("button", { name: "导出合并视频", exact: true }).first().click();
  const merge = await (await mergeResponse).json();
  created.push(merge.job.id);
  const protectedDelete = await request(`/api/library/${a.id}`, "DELETE");
  check("merge sources cannot be deleted during rendering", protectedDelete.status === 409);
  await nav(page, "素材库");
  await nav(page, "视频拼接");
  check("leaving merge workspace retains its running job", await page.evaluate((id) => JSON.parse(localStorage.getItem("codevideo:merge:project:v1")).jobId === id, merge.job.id));
  await page.reload({ waitUntil: "networkidle" });
  check("merge job reference survives refresh", await page.evaluate((id) => JSON.parse(localStorage.getItem("codevideo:merge:project:v1")).jobId === id, merge.job.id));
  const merged = await waitJob(merge.job.id);
  check("real merge exports full combined duration", merged.status === "success" && merged.totalFrames === a.durationInFrames + b.durationInFrames);
  const result = (await request("/api/library")).data.items.find((item) => item.id === merged.id);
  check("merged library entry retains narration and subtitle flags", result.hasNarration && result.hasSubtitles);
  await page.screenshot({ path: path.join(output, "merge-desktop.png"), fullPage: true });
  const rename = await request(`/api/library/${merged.id}`, "PATCH", { name: "拼接验收😀" });
  check("library rename updates the download filename", rename.status === 200 && rename.data.item.downloadFileName === "拼接验收😀.mp4");
  await page.setViewportSize({ width: 390, height: 844 });
  await delay(400);
  await page.screenshot({ path: path.join(output, "merge-mobile.png"), fullPage: true });
  check("merge workspace fits a 390px viewport", await page.evaluate(() => innerWidth === 390 && document.documentElement.scrollWidth === innerWidth));
  check("mobile merge sequence leaves room for names and controls", await page.locator('.segment-row').evaluateAll((rows) => rows.every((row) => {
    const name = row.querySelector('.segment-title').getBoundingClientRect();
    const tools = row.querySelector('.segment-tools').getBoundingClientRect();
    const bounds = row.getBoundingClientRect();
    return name.width >= 80 && tools.right <= bounds.right;
  })));
  check("site has no browser runtime errors", errors.length === 0);
  fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify({ passed, errors, created, merged }, null, 2));
  fs.rmSync(path.join(output, "failure.txt"), { force: true });
  console.log(`All ${passed.length} site checks passed.`);
} catch (error) {
  fs.writeFileSync(path.join(output, "failure.txt"), error.stack ?? String(error));
  console.error(error); process.exitCode = 1;
} finally {
  await browser?.close();
  if (createdUpload) await request(createdUpload.url, "DELETE").catch(() => {});
  // Preserve earlier user/library files. These IDs were created exclusively by this run.
  for (const id of created.reverse()) {
    try { await waitJob(id); await request(`/api/library/${id}`, "DELETE"); } catch {}
  }
}
