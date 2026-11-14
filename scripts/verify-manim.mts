import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { chromium, type Locator, type Page } from "playwright";
import { createEffect } from "../src/remotion/effects";
import { DEFAULT_VIDEO_PROPS } from "../src/remotion/params";
import type { ManimAsset, ManimJob } from "../src/remotion/manim";

const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3000";
const output = path.resolve("test-results/manim"); fs.mkdirSync(output, { recursive: true });
const results: { passed: string[]; errors: string[]; assets: ManimAsset[] } = { passed: [], errors: [], assets: [] };
const check = (name: string, ok: unknown) => { assert.ok(ok, name); results.passed.push(name); console.log(`PASS ${name}`); };
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
const post = async (route: string, body: unknown) => {
  const response = await fetch(base + route, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json(); assert.ok(response.ok, JSON.stringify(data)); return data;
};
const waitAsset = async (job: ManimJob) => {
  for (let i = 0; i < 250 && job.status !== "ready"; i++) {
    assert.notEqual(job.status, "failed", job.message); await delay(1000);
    job = (await (await fetch(base + `/api/manim/${job.id}`)).json()).job;
  }
  assert.equal(job.status, "ready", job.message); results.assets.push(job.asset!); return job.asset!;
};
const range = (node: Locator, value: number) => node.evaluate((n, value) => {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(n, String(value));
  n.dispatchEvent(new Event("input", { bubbles: true })); n.dispatchEvent(new Event("change", { bubbles: true }));
}, value);
const seek = async (page: Page, n: number) => { await range(page.getByLabel("时间轴播放位置"), n); await page.waitForTimeout(150); };
const browser = await chromium.launch({ channel: "msedge", headless: true });
let createdVideo: string | undefined;
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.on("pageerror", (e) => results.errors.push(e.message));
  const equation = { ...createEffect("math-formula"), variant: "transform", text: "a^2+b^2=c^2", targetText: "c=\\sqrt{a^2+b^2}", y: .35, size: .9, color: "#F9AB52", secondaryColor: "#F9AB52" };
  const graph = { ...createEffect("math-sine"), y: .7, size: .9, color: "#EE67C6", secondaryColor: "#EE67C6", amplitude: 1.5, frequency: .75, offset: -.5 };
  const invalid = await fetch(base + "/api/manim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ effect: { ...equation, text: "\\input{private}" } }) });
  check("server rejects TeX file and command primitives", invalid.status === 400);
  const asset = await waitAsset((await post("/api/manim", { effect: equation })).job);
  const graphAsset = await waitAsset((await post("/api/manim", { effect: graph })).job);
  check("real Manim renders formula transforms and parameterized curves", results.assets.every((a) => a.renderer === "manim" && a.version === "0.20.1" && a.frames > 60));
  const same = (await post("/api/manim", { effect: { ...equation, x: .2, opacity: .4, startFrame: 30 } })).job;
  check("moving and retiming reuses the already-rendered Manim frames", same.status === "ready" && same.asset.id === asset.id);
  await page.goto(base + "/?tab=effects#generate", { waitUntil: "networkidle" });
  const pixels = await page.evaluate(async (url) => {
    const image = new Image(); image.src = url; await image.decode();
    const c = document.createElement("canvas"); c.width = image.width; c.height = image.height;
    const ctx = c.getContext("2d")!; ctx.drawImage(image, 0, 0); const data = ctx.getImageData(0, 0, c.width, c.height).data;
    let clear = 0, opaque = 0; for(let i=3;i<data.length;i+=4) { if(data[i] === 0) clear++; if(data[i] > 200) opaque++; }
    return { clear, opaque, total: c.width*c.height };
  }, base + `${asset.baseUrl}/${String(asset.frames-1).padStart(5,"0")}.png`);
  check("actual formula pixels have a transparent background and visible glyphs", pixels.clear > pixels.total*.8 && pixels.opaque > 3000);
  for (const [label,a] of [["equation",asset],["graph",graphAsset]] as const) {
    fs.writeFileSync(path.join(output,`${label}-final.png`),Buffer.from(await (await fetch(base+`${a.baseUrl}/${String(a.frames-1).padStart(5,"0")}.png`)).arrayBuffer()));
  }
  // Seed after pagehide has flushed the previous draft, before React restores it.
  await page.addInitScript(({ equation, graph }) => {
    if (sessionStorage.getItem("manim:seeded")) return;
    const key="codevideo:project:v1", saved=JSON.parse(localStorage.getItem(key)!);
    saved.data.effects=[equation,graph];saved.data.selectedEffectId=equation.id;saved.data.values.durationInSeconds=5;saved.data.values.ratio="16:9";
    saved.data.voiceEnabled=false; saved.data.jobId=null; localStorage.setItem(key,JSON.stringify(saved));
    sessionStorage.setItem("manim:seeded", "1");
  }, { equation, graph });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".manim-render-state").filter({hasText:"Manim 动画已就绪"}).waitFor({timeout:240000});
  await seek(page, 65);
  await page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>('.canvas img[data-renderer="manim"]')].length===2 && [...document.querySelectorAll<HTMLImageElement>('.canvas img[data-renderer="manim"]')].every(n=>n.complete&&n.naturalWidth>0));
  check("editor preview uses both real Manim PNG sequences", await page.locator('.canvas img[data-renderer="manim"]').count()===2);
  check("formula target and graph parameters restore from draft", await page.getByLabel("变换后的公式（LaTeX）",{exact:true}).inputValue()===equation.targetText);
  await seek(page, 145);
  check("animation holds its last frame when its drawing has finished", Number(await page.locator(`[data-manim-asset="${asset.id}"]`).getAttribute("data-manim-frame"))===asset.frames-1);
  await seek(page, 45); const first = await page.locator(`[data-manim-asset="${asset.id}"]`).getAttribute("src");
  await seek(page, 70); await seek(page, 45);
  check("seeking backwards returns the exact same Manim frame", await page.locator(`[data-manim-asset="${asset.id}"]`).getAttribute("src")===first);
  await page.getByLabel("结束跟随视频时长").uncheck();
  await page.getByLabel("效果开始秒数").fill("1"); await page.getByLabel("效果结束秒数").fill("4");
  await seek(page, 15); check("Manim effect is absent before its component start", await page.locator(`[data-manim-asset="${asset.id}"]`).count()===0);
  await seek(page, 75); check("Manim frame time is relative to the component start", Number(await page.locator(`[data-manim-asset="${asset.id}"]`).getAttribute("data-manim-frame"))===45);
  await seek(page, 120); check("Manim effect uses an exclusive end boundary", await page.locator(`[data-manim-asset="${asset.id}"]`).count()===0);
  await page.getByLabel("效果开始秒数").fill("0"); await page.getByLabel("结束跟随视频时长").check(); await seek(page, 140);
  await page.getByLabel("公式（LaTeX）", {exact:true}).fill("\\frac{a");
  await page.locator(".manim-render-state.is-error").waitFor({timeout:60000});
  check("a broken formula reports a render error without showing stale formula frames", await page.locator(`[data-manim-asset="${asset.id}"]`).count()===0);
  const retryResponse = page.waitForResponse(r=>r.url().endsWith("/api/manim")&&r.request().method()==="POST"&&r.request().postDataJSON().effect.id===equation.id);
  await page.getByRole("button", {name:"重新生成数学动画",exact:true}).click();
  check("a failed Manim job can be explicitly retried", (await retryResponse).status()===202);
  await page.locator(".manim-render-state.is-error").waitFor({timeout:60000});
  await page.getByLabel("公式（LaTeX）", {exact:true}).fill(equation.text);
  await page.locator(".manim-render-state").filter({hasText:"Manim 动画已就绪"}).waitFor();
  await page.locator(`[data-manim-asset="${asset.id}"]`).waitFor();
  check("correcting the formula restores its matching cached animation", await page.locator(`[data-manim-asset="${asset.id}"]`).count()===1);
  await page.screenshot({path:path.join(output,"editor-desktop.png"),fullPage:true});
  await page.getByRole("button",{name:"全屏预览",exact:true}).click();
  await page.getByRole("dialog").locator('img[data-renderer="manim"]').first().waitFor();
  check("fullscreen preview retains actual Manim components", await page.getByRole("dialog").locator('img[data-renderer="manim"]').count()===2);
  await page.getByRole("button",{name:"关闭预览",exact:true}).click();
  const created = (await post("/api/render", { ...DEFAULT_VIDEO_PROPS, title:"Manim 动画验证", durationInSeconds:5, ratio:"16:9", effects:[equation,graph], name:"Manim 动画验证" })).job;
  createdVideo=created.id; let job=created;
  for(let i=0;i<250 && job.status!=="success";i++){assert.notEqual(job.status,"failed",job.error);await delay(500);job=(await(await fetch(base+`/api/jobs/${job.id}`)).json()).job;}
  check("Remotion exports Manim formula and graph into a real MP4",job.status==="success"&&job.totalFrames===150);
  const file=path.join(output,"manim-demo.mp4");fs.writeFileSync(file,Buffer.from(await(await fetch(base+job.videoUrl)).arrayBuffer()));
  const ffmpeg=path.resolve("node_modules/@remotion/compositor-win32-x64-msvc/ffmpeg.exe");
  const decoded=path.join(output,"export-final.png");execFileSync(ffmpeg,["-loglevel","error","-y","-ss","4.7","-i",file,"-frames:v","1",decoded],{windowsHide:true});
  const counts=await page.evaluate(async(url)=>{const im=new Image();im.src=url;await im.decode();const c=document.createElement("canvas");c.width=im.width;c.height=im.height;const ctx=c.getContext("2d")!;ctx.drawImage(im,0,0);const d=ctx.getImageData(0,0,c.width,c.height).data;return [[249,171,82],[238,103,198]].map(rgb=>{let count=0;for(let i=0;i<d.length;i+=4)if(rgb.every((v,k)=>Math.abs(v-d[i+k])<35))count++;return count;});},`data:image/png;base64,${fs.readFileSync(decoded).toString("base64")}`);
  check("decoded MP4 visibly contains both Manim layers",counts.every(n=>n>500));
  await page.setViewportSize({width:390,height:844});
  await page.getByRole("button",{name:/^组件属性/}).click();
  await page.screenshot({path:path.join(output,"editor-mobile.png"),fullPage:true});
  check("mobile Manim controls fit 390px",await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  check("no browser runtime errors",results.errors.length===0);
} finally {
  await browser.close();
  if(createdVideo)await fetch(base+`/api/library/${createdVideo}`,{method:"DELETE"});
  fs.writeFileSync(path.join(output,"verification.json"),JSON.stringify(results,null,2));
}
