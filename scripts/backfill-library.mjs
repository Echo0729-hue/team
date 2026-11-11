// 一次性迁移：把 output/ 里已存在、但还没有素材记录的成片补进 library.json
import fs from "node:fs";

const meta = JSON.parse(fs.readFileSync("output/_meta.json", "utf8"));
const metas = Array.isArray(meta) ? meta : [meta];
const libPath = "output/library.json";
const lib = JSON.parse(fs.readFileSync(libPath, "utf8"));

for (const item of metas) {
  if (lib.items.some((entry) => entry.id === item.id)) {
    console.log("已存在，跳过", item.id);
    continue;
  }
  const ratio = item.w === item.h ? "1:1" : item.w > item.h ? "16:9" : "9:16";
  lib.items.push({
    id: item.id,
    title: `历史导出（${item.w}×${item.h}）`,
    fileName: `${item.id}.mp4`,
    width: item.w,
    height: item.h,
    durationInSeconds: item.dur,
    durationInFrames: item.frames,
    template: "tech",
    ratio,
    kind: "single",
    segmentCount: 1,
    fileSize: fs.statSync(`output/${item.id}.mp4`).size,
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
  });
  console.log("补录", item.id, `${item.w}x${item.h}`, `${item.dur}s`);
}

lib.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
fs.writeFileSync(libPath, JSON.stringify(lib, null, 2));
console.log("素材库共", lib.items.length, "条");