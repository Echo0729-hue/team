const BASE = "http://localhost:3000";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function post(path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function poll(jobId, label) {
  for (let i = 0; i < 240; i += 1) {
    const res = await fetch(`${BASE}/api/jobs/${jobId}`, { cache: "no-store" });
    const data = await res.json();
    const job = data.job;
    if (i % 5 === 0) {
      console.log(
        `[${label}] ${job.status} ${Math.round((job.progress ?? 0) * 100)}% ${job.renderedFrames}/${job.totalFrames}`,
      );
    }
    if (job.status === "success" || job.status === "failed") {
      return job;
    }
    await sleep(1000);
  }
  throw new Error(`${label} 超时`);
}

const configs = [
  {
    label: "A-竖屏-5s",
    props: {
      title: "三支视频拼接测试 A",
      lines: ["第一段：竖屏片段 A。", "第二段：拼接顺序测试。", "第三段：时长累加校验。"],
      backgroundColor: "#0B1120",
      accentColor: "#38BDF8",
      template: "tech",
      ratio: "9:16",
      durationInSeconds: 5,
    },
  },
  {
    label: "B-横屏-6s",
    props: {
      title: "三支视频拼接测试 B",
      lines: ["第一段：横屏片段 B。", "第二段：与竖屏混拼。", "第三段：等比缩放居中。"],
      backgroundColor: "#F8F5EF",
      accentColor: "#C2703D",
      template: "editorial",
      ratio: "16:9",
      durationInSeconds: 6,
    },
  },
  {
    label: "C-竖屏-5s",
    props: {
      title: "三支视频拼接测试 C",
      lines: ["第一段：竖屏片段 C。", "第二段：换一种模板。", "第三段：验证顺序。"],
      backgroundColor: "#EEF2FF",
      accentColor: "#4F46E5",
      template: "cards",
      ratio: "9:16",
      durationInSeconds: 5,
    },
  },
];

const created = [];

for (const config of configs) {
  const { status, data } = await post("/api/render", config.props);
  if (status !== 202 || !data?.job) {
    console.error("创建失败", config.label, status, JSON.stringify(data));
    process.exit(1);
  }
  console.log(`[${config.label}] 任务已创建 ${data.job.id} 帧数 ${data.job.totalFrames}`);
  const job = await poll(data.job.id, config.label);
  if (job.status !== "success") {
    console.error("渲染失败", config.label, job.error);
    process.exit(1);
  }
  console.log(
    `[${config.label}] 完成 ${job.outputWidth}x${job.outputHeight} 帧 ${job.totalFrames} 文件 ${job.fileSize} 字节`,
  );
  created.push({ label: config.label, id: job.id, totalFrames: job.totalFrames, ratio: config.props.ratio });
}

const libraryRes = await fetch(`${BASE}/api/library`, { cache: "no-store" });
const library = await libraryRes.json();
console.log("素材库数量:", library.items.length);
for (const item of library.items) {
  console.log(
    ` - ${item.id} | ${item.title} | ${item.width}x${item.height} | ${item.durationInSeconds}s/${item.durationFrames ?? item.durationInFrames}f | ${item.kind}`,
  );
}

// 故意打乱顺序：C → A → B，验证成片顺序与总时长
const order = [created[2], created[0], created[1]];
const expectedFrames = order.reduce((sum, item) => sum + item.totalFrames, 0);

const mergeRes = await post("/api/merge", {
  segmentIds: order.map((item) => item.id),
  ratio: "9:16",
  backgroundColor: "#0B1120",
});
if (mergeRes.status !== 202) {
  console.error("创建拼接任务失败", mergeRes.status, JSON.stringify(mergeRes.data));
  process.exit(1);
}

console.log(
  `拼接顺序: ${order.map((item) => item.label).join(" → ")} 期望帧数 ${expectedFrames}`,
);
console.log(`拼接任务 ${mergeRes.data.job.id} 总帧数 ${mergeRes.data.job.totalFrames}`);

const mergeJob = await poll(mergeRes.data.job.id, "合并");
console.log("合并结果:", JSON.stringify({
  status: mergeJob.status,
  error: mergeJob.error,
  totalFrames: mergeJob.totalFrames,
  outputWidth: mergeJob.outputWidth,
  outputHeight: mergeJob.outputHeight,
  fileSize: mergeJob.fileSize,
  durationMs: mergeJob.durationMs,
  videoUrl: mergeJob.videoUrl,
}, null, 2));

console.log("帧数一致:", mergeJob.totalFrames === expectedFrames);
console.log("成片时长(秒):", (mergeJob.totalFrames / 30).toFixed(2));

const after = await (await fetch(`${BASE}/api/library`)).json();
console.log("合并后素材库数量:", after.items.length, "最新:", after.items[0]?.title, after.items[0]?.kind);

console.log("RESULT_IDS", JSON.stringify({ created, mergeJobId: mergeJob.id }));