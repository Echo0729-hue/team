// 端到端验收：命名生成 → 重命名 → 重名去重 → 删除（文件+记录）→ 合并
import fs from "node:fs";
import path from "node:path";

const BASE = "http://localhost:3000";
const OUTPUT = path.join(process.cwd(), "output");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  [${detail}]` : ""}`);
};

const post = async (url, body) => {
  const res = await fetch(`${BASE}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const patch = async (url, body) => {
  const res = await fetch(`${BASE}${url}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const del = async (url) => {
  const res = await fetch(`${BASE}${url}`, { method: "DELETE" });
  return { status: res.status, data: await res.json().catch(() => null) };
};

const poll = async (id, label) => {
  for (let i = 0; i < 300; i += 1) {
    const res = await fetch(`${BASE}/api/jobs/${id}`, { cache: "no-store" });
    const data = await res.json();
    if (data.job.status === "success" || data.job.status === "failed") {
      return data.job;
    }
    if (i % 10 === 0) {
      console.log(`  [${label}] ${Math.round((data.job.progress ?? 0) * 100)}%`);
    }
    await sleep(1000);
  }
  throw new Error(`${label} 超时`);
};

const library = async () => (await (await fetch(`${BASE}/api/library`, { cache: "no-store" })).json()).items;

const baseProps = (title, template, ratio) => ({
  title,
  lines: [`第一段：${title}。`, "第二段：名称与删除测试。", "第三段：合并顺序测试。"],
  backgroundColor: "#0B1120",
  accentColor: "#38BDF8",
  template,
  ratio,
  durationInSeconds: 5,
});

const created = [];
const stamp = String(Date.now()).slice(-5);

// 1. 生成三支视频，分别命名
const inputs = [
  { name: `产品介绍 竖屏 ${stamp}`, props: baseProps("命名测试 一", "tech", "9:16") },
  { name: `发布会 横屏 ${stamp}`, props: baseProps("命名测试 二", "editorial", "16:9") },
  { name: `结尾 卡片 ${stamp}`, props: baseProps("命名测试 三", "cards", "9:16") },
];

for (const input of inputs) {
  const { status, data } = await post("/api/render", { ...input.props, name: input.name });
  if (status !== 202 || !data?.job) {
    console.error("创建失败", status, JSON.stringify(data));
    process.exit(1);
  }
  const job = await poll(data.job.id, input.name);
  if (job.status !== "success") {
    console.error("渲染失败", job.error);
    process.exit(1);
  }
  created.push({ id: job.id, name: job.name, fileName: job.fileName });
  console.log(`  渲染完成 ${input.name} -> job.name=${job.name}`);
}

let items = await library();
const byId = new Map(items.map((i) => [i.id, i]));
check(
  "三支视频均写入素材库且名称正确",
  created.every((c) => byId.get(c.id)?.name === c.name),
  created.map((c) => byId.get(c.id)?.name).join(" | "),
);

// 2. 重命名
const renameTarget = created[0];
const renamedName = `产品介绍改名-${stamp}`;
const renamed = await patch(`/api/library/${renameTarget.id}`, { name: renamedName });
check("重命名接口返回 200 且名称已更新", renamed.status === 200 && renamed.data?.item?.name === renamedName, renamed.data?.item?.name);

const afterRename = (await library()).find((i) => i.id === renameTarget.id);
check("重命名后刷新（重新拉取素材库）仍保留新名称", afterRename?.name === renamedName, afterRename?.name);

// 3. 名称过滤与重名序号
const dirty = await patch(`/api/library/${created[1].id}`, { name: 'A/B:C*D?E"F<G>H|I' });
check(
  "非法字符被替换",
  dirty.status === 200 && !/[\\/:*?"<>|]/.test(dirty.data?.item?.name ?? ""),
  dirty.data?.item?.name,
);

const dup = await patch(`/api/library/${created[2].id}`, { name: renamedName });
check(
  "与已有名称重复时自动加序号",
  dup.status === 200 && dup.data?.item?.name === `${renamedName} (2)`,
  dup.data?.item?.name,
);

const empty = await patch(`/api/library/${created[2].id}`, { name: "   " });
check("空名称被拒绝", empty.status === 400, empty.data?.message);

const longName = await patch(`/api/library/${created[2].id}`, { name: "长".repeat(80) });
check(
  "名称长度截断到 60 字",
  longName.status === 200 && Array.from(longName.data?.item?.name ?? "").length === 60,
  String(Array.from(longName.data?.item?.name ?? "").length),
);

// 4. library.json 落盘（刷新/重启后仍在）
const raw = JSON.parse(fs.readFileSync(path.join(OUTPUT, "library.json"), "utf8"));
check(
  "library.json 记录了最新名称",
  raw.items.some((i) => i.id === renameTarget.id && i.name === renamedName),
);

// 5. 下载文件名
const dl = await fetch(`${BASE}/api/videos/${renameTarget.id}?download=1`);
const disposition = dl.headers.get("content-disposition") ?? "";
check("单独下载文件名使用视频名称", /filename\*=UTF-8''/.test(disposition) && disposition.includes(encodeURIComponent(renamedName)), disposition);
await dl.body?.cancel();

// 6. 合并（使用重命名后的名称 + 另一支）
const remain = (await library()).filter((i) => i.kind === "single").slice(0, 3);
const mergeIds = [remain[2].id, remain[0].id].filter(Boolean);
const mergeRes = await post("/api/merge", { segmentIds: mergeIds, ratio: "9:16", backgroundColor: "#0B1120" });
const mergeJob = await poll(mergeRes.data?.job?.id, "合并");
check("合并渲染成功", mergeJob.status === "success", mergeJob.error ?? "");

const mergedItem = (await library()).find((i) => i.id === mergeJob.id);
check("合并视频写入素材库并保留名称", Boolean(mergedItem?.name), mergedItem?.name);
const mergeDl = await fetch(`${BASE}/api/videos/${mergeJob.id}?download=1`);
const mergeDisp = mergeDl.headers.get("content-disposition") ?? "";
check("合并下载文件名使用视频名称", mergeDisp.includes(encodeURIComponent(mergedItem?.name ?? "")), mergeDisp);
await mergeDl.body?.cancel();

// 7. 删除：文件 + 记录 + 接口
const deleteTarget = created[1];
const beforeFile = byId.get(deleteTarget.id)?.fileName;
const deleted = await del(`/api/library/${deleteTarget.id}`);
check("删除接口返回成功", deleted.status === 200 && deleted.data?.deleted === true);
check("视频文件已从 output 移除", !fs.existsSync(path.join(OUTPUT, beforeFile)), beforeFile);
check("素材记录已移除", !(await library()).some((i) => i.id === deleteTarget.id));
const videoAfter = await fetch(`${BASE}/api/videos/${deleteTarget.id}`);
check("删除后视频地址返回 404", videoAfter.status === 404, String(videoAfter.status));
await videoAfter.body?.cancel();

const secondDelete = await del(`/api/library/${deleteTarget.id}`);
check("重复删除返回 404", secondDelete.status === 404, secondDelete.data?.message);

const mergeWithDeleted = await post("/api/merge", { segmentIds: [deleteTarget.id, renameTarget.id] });
check("引用已删除片段时合并请求被拒绝", mergeWithDeleted.status === 400, mergeWithDeleted.data?.message);

const pathEscape = await del(`/api/library/..%2F..%2Fpackage.json`);
check("越界路径删除被拒绝", pathEscape.status === 404 || pathEscape.status === 400, String(pathEscape.status));

// 8. 汇总
const failed = results.filter((r) => !r.ok);
console.log(`\n通过 ${results.length - failed.length}/${results.length}`);
if (failed.length > 0) {
  console.error("失败项:", failed.map((r) => r.label).join(", "));
  process.exitCode = 1;
}
console.log(
  "DATA",
  JSON.stringify({
    created,
    merged: { id: mergeJob.id, name: mergedItem?.name, frames: mergeJob.totalFrames },
    deleted: deleteTarget.id,
  }),
);