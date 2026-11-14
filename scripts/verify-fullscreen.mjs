import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const output = path.resolve("test-results/fullscreen");
fs.mkdirSync(output, { recursive: true });
const passed = [];
const errors = [];
const created = [];
const check = (name, value) => { assert.ok(value, name); passed.push(name); console.log(`PASS ${name}`); };
const api = async (route, body, method = body ? "POST" : "GET") => {
  const response = await fetch(base + route, { method, ...(body ? {
    headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  } : {}) });
  assert.ok(response.ok, `${method} ${route}: ${await response.clone().text()}`);
  return response.json();
};
const waitJob = async (id) => {
  for (let attempt = 0; attempt < 240; attempt++) {
    const { job } = await api(`/api/jobs/${id}`);
    if (job.status === "success") return job;
    assert.notEqual(job.status, "failed", job.error);
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw Error(`Export timed out: ${id}`);
};
const fillsViewport = (page) => page.locator(".lightbox-panel:visible").evaluate((panel) => {
  const rect = panel.getBoundingClientRect();
  return Math.abs(rect.width - innerWidth) < 2 && Math.abs(rect.height - innerHeight) < 2;
});
let browser;
try {
  browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? {
    executablePath: process.env.BROWSER_PATH,
  } : process.platform === "win32" ? { channel: "msedge" } : {}) });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  const { job: queued } = await api("/api/render", {
    title: "全屏验证", lines: ["检查成片", "全屏播放", "保留进度"], template: "tech", ratio: "16:9",
    durationInSeconds: 5, backgroundColor: "#0B1120", accentColor: "#38BDF8", name: `全屏回归-${Date.now()}`,
  });
  created.push(queued.id);
  await waitJob(queued.id);
  check("real single video export succeeds", true);
  await context.addInitScript((jobId) => {
    if (window.top !== window || !/^https?:$/.test(location.protocol)) return;
    localStorage.setItem("codevideo:project:v1", JSON.stringify({ version: 1, data: { jobId, values: { title: "全屏验证" } } }));
  }, queued.id);
  const page = await context.newPage();
  await page.goto(base + "/#generate", { waitUntil: "networkidle" });
  const inline = page.locator(".result-video:visible");
  await inline.waitFor();
  await inline.evaluate(async (video) => {
    if (!video.readyState) await new Promise((resolve) => video.addEventListener("loadedmetadata", resolve, { once: true }));
    video.currentTime = 1.25; video.volume = 0.4; video.muted = true; video.playbackRate = 0.75;
  });
  const entry = page.getByRole("button", { name: "全屏播放", exact: true });
  await entry.click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  const dialog = page.getByRole("dialog");
  await page.waitForFunction(() => document.querySelector(".lightbox-video")?.readyState >= 2);
  check("result entry opens real browser fullscreen", await page.evaluate(() => document.fullscreenElement?.classList.contains("lightbox-panel")));
  check("native fullscreen fills the viewport", await fillsViewport(page));
  check("fullscreen preserves progress, volume and rate", await dialog.locator("video").evaluate((v) => v.currentTime >= 1.2 && v.volume === 0.4 && v.muted && v.playbackRate === 0.75));
  check("underlying result playback is paused", await inline.evaluate((v) => v.paused));
  await dialog.locator("video").evaluate((video) => { video.pause(); video.currentTime = 2.5; });
  await dialog.getByRole("button", { name: "关闭预览" }).click();
  await page.waitForFunction(() => !document.fullscreenElement);
  check("closing fullscreen restores playback position", await inline.evaluate((v) => Math.abs(v.currentTime - 2.5) < 0.05 && v.paused));
  await page.waitForFunction(() => document.activeElement?.textContent === "全屏播放" && document.body.style.overflow !== "hidden");
  check("closing restores keyboard focus and scroll", await entry.evaluate((button) => document.activeElement === button));
  await entry.click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await dialog.getByRole("button", { name: "退出全屏", exact: true }).click();
  await page.waitForFunction(() => !document.fullscreenElement);
  check("exit fullscreen keeps the video dialog open", await dialog.isVisible());
  await dialog.getByRole("button", { name: "全屏", exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => !document.fullscreenElement);
  check("Escape first exits fullscreen", await dialog.isVisible());
  await dialog.getByRole("button", { name: "全屏", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  check("second Escape closes the dialog", true);

  // A real merge uses the same result component and API-served MP4 playback.
  const { items } = await api("/api/library");
  const source = items.find((item) => item.id !== queued.id);
  assert.ok(source, "an existing library clip is required for merge verification");
  const { job: merge } = await api("/api/merge", { segmentIds: [queued.id, source.id], ratio: "9:16", backgroundColor: "#000000", name: `全屏拼接回归-${Date.now()}` });
  created.push(merge.id);
  await waitJob(merge.id);
  const mergeContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await mergeContext.addInitScript(({ ids, jobId }) => {
    if (window.top !== window || !/^https?:$/.test(location.protocol)) return;
    localStorage.setItem("codevideo:merge:selection", JSON.stringify(ids));
    localStorage.setItem("codevideo:merge:project:v1", JSON.stringify({ version: 1, ratio: "9:16", background: "#000000", jobId }));
  }, { ids: [queued.id, source.id], jobId: merge.id });
  const mergePage = await mergeContext.newPage();
  mergePage.on("pageerror", (error) => errors.push(error.message));
  await mergePage.goto(base + "/#merge", { waitUntil: "networkidle" });
  await mergePage.getByRole("button", { name: "全屏播放", exact: true }).click();
  await mergePage.waitForFunction(() => !!document.fullscreenElement && document.querySelector(".lightbox-video")?.readyState >= 2);
  check("real merged video opens and decodes in fullscreen", await fillsViewport(mergePage));
  await mergePage.screenshot({ path: path.join(output, "desktop-fullscreen.png") });
  await mergePage.getByRole("button", { name: "关闭预览" }).click();
  await mergeContext.close();

  for (const mode of ["disabled", "denied"]) {
    const fallback = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await fallback.addInitScript((mode) => {
      if (mode === "disabled") {
        Object.defineProperty(document, "fullscreenEnabled", { get: () => false });
        // Chromium also exposes a working WebKit alias; disable both capabilities.
        Object.defineProperty(Element.prototype, "webkitRequestFullscreen", { value: undefined });
        Object.defineProperty(HTMLVideoElement.prototype, "webkitEnterFullscreen", { value: undefined });
      }
      else Element.prototype.requestFullscreen = () => Promise.reject(new DOMException("Fullscreen denied", "NotAllowedError"));
    }, mode);
    const mobile = await fallback.newPage();
    mobile.on("pageerror", (error) => errors.push(error.message));
    await mobile.goto(base + "/#library", { waitUntil: "networkidle" });
    await mobile.getByRole("button", { name: "播放", exact: true }).first().click();
    const modal = mobile.getByRole("dialog");
    check(`${mode}: fullscreen entry remains visible`, await modal.getByRole("button", { name: "全屏", exact: true }).isVisible());
    await modal.getByRole("button", { name: "全屏", exact: true }).click();
    await mobile.locator(".is-page-fullscreen").waitFor();
    check(`${mode}: fallback fills the mobile viewport`, await fillsViewport(mobile));
    await mobile.waitForFunction(() => document.querySelector(".lightbox-video")?.readyState >= 2);
    check(`${mode}: fullscreen video remains playable without cropping`, await modal.locator("video").evaluate((v) => v.videoWidth > 0 && getComputedStyle(v).objectFit === "contain"));
    if (mode === "disabled") await mobile.screenshot({ path: path.join(output, "mobile-fullscreen.png") });
    await mobile.keyboard.press("Escape");
    await mobile.locator(".is-page-fullscreen").waitFor({ state: "hidden" });
    check(`${mode}: Escape exits fallback without closing playback`, await modal.isVisible());
    await modal.getByRole("button", { name: "全屏", exact: true }).click();
    await modal.getByRole("button", { name: "退出全屏", exact: true }).click();
    check(`${mode}: fullscreen toggle can enter and exit repeatedly`, await modal.getByRole("button", { name: "全屏", exact: true }).isVisible());
    await mobile.keyboard.press("Escape");
    await modal.waitFor({ state: "hidden" });
    check(`${mode}: closing releases background scroll`, await mobile.evaluate(() => document.body.style.overflow !== "hidden"));
    await fallback.close();
  }
  check("no browser runtime errors", errors.length === 0);
  fs.rmSync(path.join(output, "failure.txt"), { force: true });
} catch (error) {
  fs.writeFileSync(path.join(output, "failure.txt"), String(error.stack ?? error));
  throw error;
} finally {
  await browser?.close();
  for (const id of created.toReversed()) await fetch(`${base}/api/library/${id}`, { method: "DELETE" }).catch(() => undefined);
  fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify({ passed, errors }, null, 2));
}
