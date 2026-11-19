import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium, type Page, type Locator } from "playwright";
import { createEffect, EFFECT_CATEGORIES, EFFECT_PRESETS } from "../src/remotion/effects";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const output = path.resolve("test-results/effects");
fs.mkdirSync(output, { recursive: true });
const passed: string[] = [], errors: string[] = [], created: string[] = [];
const check = (name: string, value: unknown) => { assert.ok(value, name); passed.push(name); console.log(`PASS ${name}`); };
const browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_PATH ? { executablePath: process.env.BROWSER_PATH } : process.platform === "win32" ? { channel: "msedge" } : {}) });
const api = async (route: string, body?: unknown) => {
  const response = await fetch(base + route, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);
  assert.ok(response.ok, await response.clone().text()); return response.json();
};
const changeRange = async (locator: Locator, value: number) => locator.evaluate((node, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(node, String(value));
  node.dispatchEvent(new Event("input", { bubbles: true })); node.dispatchEvent(new Event("change", { bubbles: true }));
}, value);
const select = (page: Page, name: string) => page.locator(".effect-select").filter({ has: page.locator("strong", { hasText: new RegExp(`^${name}$`) }) }).click();
const draft = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("codevideo:project:v1")!).data);
const seek = async (page: Page, frame: number) => { await changeRange(page.getByLabel("时间轴播放位置"), frame); await page.waitForTimeout(80); };

try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  context.on("page", (page) => page.on("pageerror", (error) => errors.push(error.message)));
  const page = await context.newPage();
  await page.goto(base + "/?tab=effects#generate", { waitUntil: "networkidle" });
  check("old/default projects open with an empty effect stack", await page.locator(".effect-stack li").count() === 0);
  for (const category of EFFECT_CATEGORIES) {
    await page.getByRole("button", { name: category.name, exact: true }).click();
    for (const preset of EFFECT_PRESETS.filter((p) => p.category === category.id)) await page.getByRole("button", { name: `添加${preset.name}`, exact: true }).click();
  }
  check("all ten presets can be added through the UI", await page.locator(".effect-stack li").count() === 10);
  await select(page, "生长柱状图");
  await page.getByLabel("图表数值", { exact: true }).fill("85, 20, 60");
  await page.getByLabel("图表数值", { exact: true }).fill("85, wrong, 60");
  check("invalid chart data has a visible recovery message", await page.getByLabel("图表数值", { exact: true }).getAttribute("aria-invalid") === "true");
  await page.getByLabel("图表数值", { exact: true }).fill("85, 20, 60");
  await select(page, "公式推演");
  await page.getByLabel("公式（LaTeX）", { exact: true }).fill("\\frac{a^2}{b} = c");
  await seek(page, 60);
  await page.locator('.manim-render-state').filter({ hasText: "Manim 动画已就绪" }).waitFor({ timeout: 240000 });
  await page.locator('.canvas img[data-renderer="manim"]').first().waitFor();
  check("LaTeX is rendered using actual Manim frame images", await page.locator('.canvas img[data-renderer="manim"]').count() >= 1);
  await select(page, "旋转几何体");
  await page.getByLabel("效果样式", { exact: true }).selectOption("octahedron");
  await select(page, "浮动信息卡");
  await page.getByLabel("组件名称", { exact: true }).fill("演示信息");
  await page.getByLabel("显示文字", { exact: true }).fill("可组合、可调节、可保存");
  await changeRange(page.getByLabel("水平位置", { exact: true }), 32);
  await changeRange(page.getByLabel("效果强度", { exact: true }), 80);
  await page.getByLabel("结束跟随视频时长").uncheck();
  await page.getByLabel("效果开始秒数").fill("1");
  await page.getByLabel("效果结束秒数").fill("3");
  await page.waitForTimeout(250);
  const saved = await draft(page);
  const custom = saved.effects.find((e: { name: string }) => e.name === "演示信息");
  check("parameters and timing update the saved component", custom.x === 0.32 && custom.intensity === 0.8 && custom.startFrame === 30 && custom.endFrame === 90);
  await seek(page, 0);
  check("component is absent before its time window", await page.locator(`.canvas [data-effect-id="${custom.id}"]`).count() === 0);
  await seek(page, 60);
  check("component appears inside its time window", await page.locator(`.canvas [data-effect-id="${custom.id}"]`).count() === 1);
  await seek(page, 90);
  check("component is absent at its exclusive end frame", await page.locator(`.canvas [data-effect-id="${custom.id}"]`).count() === 0);
  await seek(page, 60);
  await page.getByRole("button", { name: "隐藏演示信息", exact: true }).click();
  check("visibility disables the actual rendered component", await page.locator(`.canvas [data-effect-id="${custom.id}"]`).count() === 0);
  await page.getByRole("button", { name: "显示演示信息", exact: true }).click();
  await page.getByRole("button", { name: "复制组件", exact: true }).click();
  check("duplicate adds an independent component", await page.locator(".effect-stack li").count() === 11);
  await page.getByRole("button", { name: "下移组件", exact: true }).click();
  check("layer ordering is editable", (await page.locator(".effect-stack li").nth(1).innerText()).includes("演示信息 副本"));
  await page.getByRole("button", { name: "删除组件", exact: true }).click();
  check("removing a component keeps the other ten", await page.locator(".effect-stack li").count() === 10);
  await page.waitForTimeout(250);
  await page.reload({ waitUntil: "networkidle" });
  const restored = await draft(page);
  check("refresh restores components, order and custom settings", restored.effects.length === 10 && restored.effects.find((e: { id: string }) => e.id === custom.id).text === custom.text && restored.effects[1].values.join(",") === "85,20,60");
  check("refresh restores 3D variants and formulas", restored.effects.find((e: { preset: string }) => e.preset === "three-cube").variant === "octahedron" && restored.effects.find((e: { preset: string }) => e.preset === "math-formula").text === "\\frac{a^2}{b} = c");
  await page.getByRole("tab", { name: /^内容/ }).click();
  check("original content controls remain available", await page.locator("#title").isVisible());
  await page.getByRole("tab", { name: /^图层/ }).click();
  check("original layer controls remain available", await page.getByRole("heading", { name: "素材与图层" }).isVisible());
  await page.getByRole("tab", { name: /^效果/ }).click();
  await page.getByRole("button", { name: "预览全屏播放", exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement);
  await page.waitForTimeout(250);
  check("effect preview opens stable fullscreen", await page.getByRole("dialog").isVisible());
  await page.getByRole("button", { name: "关闭预览", exact: true }).click();

  // A dedicated grid makes every style identifiable in a decoded, API-rendered MP4.
  const colors = ["#FF3456", "#FFAA00", "#A35BFF", "#70EE99", "#E9EC46", "#35E9EF", "#E871CB", "#658CFF"];
  const exportEffects = EFFECT_PRESETS.map((preset, i) => ({
    ...createEffect(preset.id), x: [0.18, 0.4, 0.62, 0.82][i % 4], y: i < 4 ? 0.35 : 0.72, size: 0.36,
    color: colors[i] ?? "#0B1120", secondaryColor: colors[i] ?? "#FFFFFF", intensity: preset.id === "motion-fade" ? 1 : 0.65,
  }));
  await page.addInitScript((effects) => {
    if (sessionStorage.getItem("effects:export-seeded")) return;
    const key = "codevideo:project:v1", saved = JSON.parse(localStorage.getItem(key)!);
    saved.data.effects = effects; saved.data.selectedEffectId = effects[6].id; saved.data.jobId = null;
    saved.data.values.ratio = "16:9"; saved.data.values.durationInSeconds = 5; saved.data.values.title = "组件效果验证";
    saved.data.videoName = "组件效果验证"; saved.data.nameTouched = true; saved.data.voiceEnabled = false;
    localStorage.setItem(key, JSON.stringify(saved));
    sessionStorage.setItem("effects:export-seeded", "1");
  }, exportEffects);
  await page.reload({ waitUntil: "networkidle" });
  const responsePromise = page.waitForResponse((r) => r.url().endsWith("/api/render") && r.request().method() === "POST");
  await page.locator(".topnav").getByRole("button", { name: "导出视频", exact: true }).click();
  const response = await responsePromise, data = await response.json();
  assert.equal(response.status(), 202, JSON.stringify(data)); created.push(data.job.id);
  check("UI export sends all components through the real API", data.job.props.effects.length === 10);
  let job = data.job;
  for (let i = 0; i < 360 && job.status !== "success"; i++) {
    assert.notEqual(job.status, "failed", job.error);
    await new Promise((resolve) => setTimeout(resolve, 500)); job = (await api(`/api/jobs/${job.id}`)).job;
  }
  fs.writeFileSync(path.join(output, "render-job.json"), JSON.stringify(job, null, 2));
  check("all ten presets render into a real 5-second MP4", job.status === "success" && job.totalFrames === 150 && job.outputWidth === 1920 && job.outputHeight === 1080);
  const bytes = Buffer.from(await (await fetch(base + job.videoUrl)).arrayBuffer());
  fs.writeFileSync(path.join(output, "effects-demo.mp4"), bytes);
  check("download endpoint serves actual MP4 bytes", bytes.byteLength > 10000 && bytes.includes(Buffer.from("ftyp")));
  const video = page.locator(".result-video:visible");
  await video.waitFor();
  await video.evaluate(async (node: HTMLVideoElement) => {
    node.pause(); if (node.readyState < 2) await new Promise((resolve) => node.addEventListener("loadeddata", resolve, { once: true }));
    await new Promise((resolve) => { node.addEventListener("seeked", resolve, { once: true }); node.currentTime = 2; });
  });
  // Decode the saved MP4 independently of the browser's presentation queue.
  const ffmpeg = process.env.FFMPEG_PATH ?? (process.platform === "win32" ? path.resolve("node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe") : "ffmpeg");
  const pngPath = path.join(output, "rendered-frame.png");
  execFileSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-ss", "2", "-i", path.join(output, "effects-demo.mp4"), "-frames:v", "1", pngPath]);
  const counts = await page.evaluate(async ({ url, colors }) => {
    const image = new Image(); image.src = url; await image.decode();
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    const ctx = canvas.getContext("2d")!; ctx.drawImage(image, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    return colors.map((hex) => {
      const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)); let count = 0;
      for (let i = 0; i < data.length; i += 4) if (rgb.every((n, channel) => Math.abs(n - data[i + channel]) < 32)) count++;
      return count;
    });
  }, { url: `data:image/png;base64,${fs.readFileSync(pngPath).toString("base64")}`, colors });
  fs.writeFileSync(path.join(output, "decoded-colors.json"), JSON.stringify(counts));
  check("decoded MP4 contains the colors of all eight visual components", counts.every((n) => n > 20));
  await page.getByRole("button", { name: "全屏播放", exact: true }).click();
  await page.waitForFunction(() => !!document.fullscreenElement && (document.querySelector(".lightbox-video") as HTMLVideoElement)?.readyState >= 2);
  check("generated effect video remains playable in fullscreen", await page.getByRole("dialog").isVisible());
  await page.getByRole("button", { name: "关闭预览", exact: true }).click();
  check("desktop layout fits its viewport", await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  mobile.on("pageerror", (error) => errors.push(error.message));
  await mobile.goto(base + "/?tab=effects#generate", { waitUntil: "networkidle" });
  await mobile.getByRole("button", { name: "添加浮动信息卡", exact: true }).click();
  await changeRange(mobile.getByLabel("水平位置", { exact: true }), 45);
  check("mobile exposes working component controls", await mobile.getByLabel("水平位置", { exact: true }).inputValue() === "45");
  check("mobile layout fits 390px", await mobile.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  check("no browser runtime errors", errors.length === 0);
  fs.rmSync(path.join(output, "failure.txt"), { force: true });
} catch (error) {
  fs.writeFileSync(path.join(output, "failure.txt"), String((error as Error).stack ?? error)); throw error;
} finally {
  await browser.close();
  for (const id of created.toReversed()) await fetch(`${base}/api/library/${id}`, { method: "DELETE" });
  fs.writeFileSync(path.join(output, "verification.json"), JSON.stringify({ passed, errors }, null, 2));
}
