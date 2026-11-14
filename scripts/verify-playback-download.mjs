import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const output = path.resolve("test-results/playback-download");
fs.mkdirSync(output, { recursive: true });
const passed = [], errors = [], savedFiles = [];
const check = (name, value) => { assert.ok(value, name); passed.push(name); console.log(`PASS ${name}`); };
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? {
  executablePath: process.env.BROWSER_PATH,
} : process.platform === "win32" ? { channel: "msedge" } : {}) });
const library = (await (await fetch(base + "/api/library")).json()).items;
assert.ok(library.length >= 2, "two existing clips required");
const checkSave = async (pageOrFrame, button, item, label) => {
  const response = pageOrFrame.waitForResponse((r) => r.url().endsWith(`/api/videos/${item.id}/save`) && r.request().method() === "POST");
  await button.click();
  const result = await response;
  const data = await result.json();
  assert.equal(result.status(), 200, JSON.stringify(data));
  savedFiles.push(data.saved.path);
  const bytes = fs.readFileSync(data.saved.path);
  check(`${label}: video really exists in Downloads`, bytes.byteLength === item.fileSize);
  const source = Buffer.from(await (await fetch(base + item.videoUrl)).arrayBuffer());
  check(`${label}: downloaded bytes match the generated MP4`, hash(bytes) === hash(source));
  check(`${label}: saved path is shown after success`, await button.locator("..").getByRole("status").innerText().then((text) => text.includes(data.saved.path)));
};
const fillsViewport = (panel) => panel.evaluate((node) => {
  const r = node.getBoundingClientRect(); return Math.abs(r.width - innerWidth) < 2 && Math.abs(r.height - innerHeight) < 2;
});

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.on("page", (page) => page.on("pageerror", (err) => errors.push(err.message)));
  const page = await context.newPage();
  await page.goto(base + "/#generate", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "预览全屏播放", exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  const modal = page.getByRole("dialog");
  await page.waitForTimeout(1600);
  check("preview fullscreen remains active after resize", await page.evaluate(() => document.fullscreenElement?.classList.contains("lightbox-panel")));
  check("preview fullscreen fills the viewport", await fillsViewport(modal.locator(".lightbox-panel")));
  check("fullscreen is outside clipped workspaces", await modal.evaluate((node) => node.parentElement === document.body));
  await modal.getByRole("button", { name: "关闭预览" }).click();
  await page.waitForFunction(() => !document.fullscreenElement);
  await page.getByRole("tab", { name: /^画面/ }).click();
  const player = page.locator(".canvas .preview-frame > div").first();
  await player.evaluate((node) => node.setAttribute("data-stable-player", "true"));
  await page.setViewportSize({ width: 1250, height: 900 });
  await page.waitForTimeout(350);
  check("resizing preserves the player instance", await page.locator('[data-stable-player="true"]').count() === 1);
  await page.locator(".sidebar .nav-item").filter({ hasText: "素材库" }).click();
  const card = page.locator(".lib-card").filter({ has: page.locator(`video[src^="${library[0].videoUrl}"]`) });
  await checkSave(page, card.getByRole("button", { name: "下载", exact: true }), library[0], "library");
  const duplicateResponse = page.waitForResponse((r) => r.url().endsWith(`/api/videos/${library[0].id}/save`) && r.request().method() === "POST");
  await card.getByRole("button", { name: "下载", exact: true }).click();
  const duplicate = await (await duplicateResponse).json();
  savedFiles.push(duplicate.saved.path);
  check("repeated downloads keep both files", savedFiles[0] !== duplicate.saved.path && fs.existsSync(savedFiles[0]) && fs.existsSync(duplicate.saved.path));

  // Exercise the same page inside a real sandbox that denies native fullscreen/downloads.
  const embedded = await context.newPage();
  await embedded.route(base + "/embedded-test", (route) => route.fulfill({ contentType: "text/html", body:
    '<html><body style="margin:0"><iframe id="embedded" src="/#generate" sandbox="allow-scripts allow-same-origin" allow="fullscreen \'none\'" style="width:100vw;height:100vh;border:0"></iframe></body></html>',
  }));
  await embedded.goto(base + "/embedded-test", { waitUntil: "networkidle" });
  const frame = await (await embedded.locator("#embedded").elementHandle()).contentFrame();
  await frame.getByRole("button", { name: "预览全屏播放", exact: true }).waitFor();
  await frame.getByRole("button", { name: "预览全屏播放", exact: true }).click();
  await frame.locator(".is-page-fullscreen").waitFor();
  await embedded.waitForTimeout(1600);
  check("sandboxed preview remains expanded after native rejection", await fillsViewport(frame.locator(".lightbox-panel")));
  await frame.getByRole("button", { name: "关闭预览" }).click();
  await frame.locator(".sidebar .nav-item").filter({ hasText: "素材库" }).click();
  const embeddedCard = frame.locator(".lib-card").filter({ has: frame.locator(`video[src^="${library[0].videoUrl}"]`) });
  await checkSave(embedded, embeddedCard.getByRole("button", { name: "下载", exact: true }), library[0], "sandbox without downloads permission");
  await embeddedCard.getByRole("button", { name: "播放", exact: true }).click();
  await frame.getByRole("dialog").getByRole("button", { name: "全屏", exact: true }).click();
  await frame.locator(".is-page-fullscreen").waitFor();
  await embedded.waitForTimeout(1200);
  check("sandboxed material video stays in page fullscreen", await fillsViewport(frame.locator(".lightbox-panel")));
  await embedded.screenshot({ path: path.join(output, "embedded-fullscreen.png") });
  await frame.getByRole("button", { name: "关闭预览" }).click();

  const denied = await fetch(base + `/api/videos/${library[0].id}/save`, { method: "POST", headers: { origin: "https://example.com" } });
  check("foreign websites cannot trigger local copies", denied.status === 403);
  const missing = await fetch(base + "/api/videos/00000000-0000-0000-0000-000000000000/save", { method: "POST", headers: { origin: base } });
  check("missing video has a useful error", missing.status === 404 && (await missing.json()).message.includes("删除"));
  check("no browser runtime errors", errors.length === 0);
} finally {
  await browser.close();
  for (const file of savedFiles) fs.rmSync(file, { force: true });
  fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify({ passed, errors }, null, 2));
}
