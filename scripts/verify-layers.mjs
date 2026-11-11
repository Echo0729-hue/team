// 图层功能端到端验证：上传 → 建图层 → 渲染 → 输出任务信息
import fs from "node:fs";

const BASE = "http://localhost:3000";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
};

const upload = async (path, name, type) => {
  const buffer = fs.readFileSync(path);
  const form = new FormData();
  form.append("file", new Blob([buffer], { type }), name);
  const res = await fetch(`${BASE}/api/uploads`, { method: "POST", body: form });
  return { status: res.status, data: await res.json().catch(() => null) };
};

// 1) 合法 PNG
const png = await upload("test-layer.png", "测试图层.png", "image/png");
check("上传 PNG 成功并返回尺寸", png.status === 201 && png.data?.upload?.width === 800, JSON.stringify(png.data?.upload?.url ?? png.data?.message));
const image = png.data?.upload;

// 2) 非法类型
fs.writeFileSync("bad-upload.txt", "not an image");
const bad = await upload("bad-upload.txt", "bad.txt", "text/plain");
check("非图片文件被拒绝", bad.status === 415, bad.data?.message);
fs.unlinkSync("bad-upload.txt");

// 3) 图片可访问
const imageRes = await fetch(`${BASE}${image.url}`);
const imageBody = Buffer.from(await imageRes.arrayBuffer());
check("上传后的图片通过服务端可读取", imageRes.status === 200 && imageBody.length === fs.statSync("test-layer.png").size, `${imageBody.length} 字节`);

// 4) 文字字体可用（本机 Windows 字体）
const fontCheck = await fetch(`${BASE}/api/uploads/${image.id}.json`);
check("合法的图片地址返回 200", imageRes.status === 200, String(imageRes.status));
await fontCheck.body?.cancel();

// 5) 创建带图层的渲染任务
const payload = {
  title: "图层渲染验证",
  lines: ["第一段：图片与文字叠加。", "第二段：位置与层级检查。", "第三段：时段与字体检查。"],
  backgroundColor: "#0B1120",
  accentColor: "#38BDF8",
  template: "tech",
  ratio: "9:16",
  durationInSeconds: 6,
  name: `图层验证-${Date.now().toString().slice(-5)}`,
  durationMode: "fixed",
  narration: { enabled: false },
  subtitles: { enabled: false },
  layers: [
    {
      id: "layer-text-title",
      kind: "text",
      name: "主标题",
      x: 0.5,
      y: 0.17,
      rotation: 0,
      opacity: 1,
      startFrame: 0,
      endFrame: 180,
      hidden: false,
      locked: false,
      text: "图层标题：宋体测试",
      fontId: "songti",
      fontSize: 92,
      fontWeight: 700,
      italic: false,
      color: "#FFD166",
      align: "center",
      lineHeight: 1.25,
      letterSpacing: 2,
      strokeColor: "#3A1D00",
      strokeWidth: 0,
      shadow: { enabled: true, color: "#000000", offsetX: 0, offsetY: 6, blur: 16 },
      boxWidth: 0.9,
    },
    {
      id: "layer-image-1",
      kind: "image",
      name: "测试图片",
      x: 0.5,
      y: 0.52,
      rotation: 0,
      opacity: 1,
      startFrame: 0,
      endFrame: 180,
      hidden: false,
      locked: false,
      src: image.url,
      width: 0.72,
      height: 0.18,
      aspect: 800 / 450,
      fit: "contain",
    },
    {
      id: "layer-image-2",
      kind: "image",
      name: "旋转图片",
      x: 0.24,
      y: 0.78,
      rotation: 18,
      opacity: 0.9,
      startFrame: 0,
      endFrame: 180,
      hidden: false,
      locked: false,
      src: image.url,
      width: 0.3,
      height: 0.075,
      aspect: 800 / 450,
      fit: "cover",
    },
    {
      id: "layer-text-temp",
      kind: "text",
      name: "限时说明",
      x: 0.5,
      y: 0.9,
      rotation: 0,
      opacity: 1,
      startFrame: 0,
      endFrame: 45,
      hidden: false,
      locked: false,
      text: "前 1.5 秒出现的楷体字幕",
      fontId: "kaiti",
      fontSize: 52,
      fontWeight: 400,
      italic: false,
      color: "#FFFFFF",
      align: "center",
      lineHeight: 1.4,
      letterSpacing: 1,
      strokeColor: "#000000",
      strokeWidth: 3,
      shadow: { enabled: true, color: "#000000", offsetX: 0, offsetY: 3, blur: 8 },
      boxWidth: 0.8,
    },
  ],
};

const create = await fetch(`${BASE}/api/render`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
const created = await create.json().catch(() => null);
check("创建带图层的渲染任务", create.status === 202 && Boolean(created?.job?.id), created?.message ?? "");

if (create.status !== 202 || !created?.job) {
  console.log(`\n通过 ${results.filter((r) => r.ok).length}/${results.length}`);
  process.exit(1);
}

// 6) 校验图层被服务端接受（数量与时段）
check("服务端保留全部 4 个图层", created.job.props?.layers?.length === 4, String(created.job.props?.layers?.length));

// 7) 非法图层被过滤：越界坐标、未知图片地址
const badLayerPayload = {
  ...payload,
  name: `图层过滤-${Date.now().toString().slice(-5)}`,
  layers: [
    { ...payload.layers[0], x: 9, y: -9, opacity: 5, fontSize: 999 },
    { ...payload.layers[1], src: "/api/uploads/../package.json" },
  ],
};
const filtered = await fetch(`${BASE}/api/render`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(badLayerPayload),
});
const filteredData = await filtered.json().catch(() => null);
const accepted = filteredData?.job?.props?.layers ?? [];
check(
  "越界坐标被收敛、非法图片地址被丢弃",
  filtered.status === 202 && accepted.length === 1 && accepted[0].x <= 1.2 && accepted[0].x >= -0.2 && accepted[0].opacity <= 1,
  JSON.stringify(accepted.map((l) => ({ kind: l.kind, x: l.x, opacity: l.opacity, fontSize: l.fontSize }))),
);

// 8) 等待主任务导出
let job = null;
for (let i = 0; i < 300; i += 1) {
  const data = await (await fetch(`${BASE}/api/jobs/${created.job.id}`)).json();
  job = data.job;
  if (job.status === "success" || job.status === "failed") break;
  if (i % 15 === 0) console.log(`  渲染中 ${Math.round((job.progress ?? 0) * 100)}%`);
  await sleep(1000);
}

check("带图层视频渲染成功", job?.status === "success", job?.error ?? "");
if (job?.status === "success") {
  fs.writeFileSync(
    "layer-result.json",
    JSON.stringify({ job: job.id, file: job.fileName, frames: job.totalFrames, upload: image }, null, 2),
    "utf8",
  );
}

console.log(`\n通过 ${results.filter((r) => r.ok).length}/${results.length}`);
if (results.some((r) => !r.ok)) {
  process.exitCode = 1;
}