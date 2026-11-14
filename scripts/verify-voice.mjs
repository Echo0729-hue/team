// 配音 + 字幕 + 时长 的端到端验证
import fs from "node:fs";

const BASE = "http://localhost:3000";
const contentA = { title: "配音同步", lines: ["先讲结构。", "字幕跟随配音。", "时长跟随讲解。"] };
const contentShort = { title: "短配音", lines: ["一。", "二。", "三。"] };
const contentLong = { title: "超长配音", lines: ["先确定观众。", "再整理知识点。", "最后检查导出。"] };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (label, ok, detail = "") => {
  results.push({ label, ok });
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

const poll = async (id, label) => {
  for (let i = 0; i < 400; i += 1) {
    const data = await (await fetch(`${BASE}/api/jobs/${id}`, { cache: "no-store" })).json();
    const job = data.job;
    if (job.status === "success" || job.status === "failed") {
      return job;
    }
    if (i % 10 === 0) {
      console.log(`  [${label}] ${Math.round((job.progress ?? 0) * 100)}%`);
    }
    await sleep(1000);
  }
  throw new Error(`${label} 超时`);
};

const synth = async (script, speed = 1, content = contentA, voiceId = "local:Microsoft Huihui Desktop") => {
  const { status, data } = await post("/api/tts", { script, voiceId, speed, content });
  if (status !== 200 || !data?.tts) {
    throw new Error(`配音失败 ${status} ${data?.message ?? ""}`);
  }
  return data.tts;
};

const render = async ({ script, tts, speed, ratio, template, content, durationMode, subtitle }) => {
  const { status, data } = await post("/api/render", {
    ...content,
    backgroundColor: "#0B1120",
    accentColor: "#38BDF8",
    template,
    ratio,
    durationInSeconds: 10,
    name: `配音测试-${Date.now().toString().slice(-5)}`,
    durationMode,
    narration: {
      enabled: true,
      ttsId: tts.id,
      audioSrc: tts.audioUrl,
      script,
      voiceId: tts.voiceId,
      voiceName: tts.voiceName,
      provider: tts.provider,
      speed,
      volume: 0.9,
      audioDurationSeconds: tts.durationSeconds,
    },
    subtitles: {
      enabled: true,
      fontScale: 1,
      color: "#FFFFFF",
      backgroundOpacity: 0.45,
      position: "bottom",
      cues: tts.cues.map((cue) => ({
        text: cue.text,
        lines: cue.lines,
        startFrame: cue.startFrame,
        endFrame: cue.endFrame,
      })),
      ...subtitle,
    },
  });
  if (status !== 202) {
    return { status, data };
  }
  const job = await poll(data.job.id, content.title);
  return { status, job };
};

// 1) 中等长度讲稿（约 9 秒）
const scriptA = "配音同步。\n先把结构讲清楚。\n字幕会跟着配音出现。\n时长跟随讲解。";
const ttsA = await synth(scriptA, 1);
check("中文讲稿生成配音", ttsA.durationSeconds > 5 && ttsA.durationSeconds < 15, `${ttsA.durationSeconds}s / ${ttsA.cues.length} 句`);
check("字幕按句生成且不按字数均分", ttsA.cues.length >= 3 && ttsA.cues.every((cue) => cue.endFrame > cue.startFrame), ttsA.cues.map((c) => `${c.startFrame}-${c.endFrame}`).join(" "));

const audioRes = await fetch(`${BASE}${ttsA.audioUrl}`);
const audioBuf = Buffer.from(await audioRes.arrayBuffer());
check("音频可播放（WAV 可下载）", audioRes.status === 200 && audioBuf.length > 100_000, `${audioBuf.length} 字节`);

const srt = await (await fetch(`${BASE}${ttsA.srtUrl}`)).text();
check("SRT 可下载且含时间轴", srt.includes("-->") && srt.split("\n").filter((l) => l.includes("-->")).length === ttsA.cues.length);

// 2) 同一讲稿 1.25 倍速：时长应明显变短
const ttsFast = await synth(scriptA, 1.25);
check("语速 1.25× 后配音时长变短", ttsFast.durationSeconds < ttsA.durationSeconds - 0.3, `${ttsA.durationSeconds}s → ${ttsFast.durationSeconds}s`);
check("语速变化生成新的字幕时间轴", ttsFast.cues[ttsFast.cues.length - 1].endFrame < ttsA.cues[ttsA.cues.length - 1].endFrame);

// 3) 跟随配音时长导出（9 秒讲稿）
const outA = await render({
  script: scriptA,
  tts: ttsA,
  speed: 1,
  ratio: "9:16",
  template: "tech",
  content: contentA,
  durationMode: "voice",
});
check("带配音视频导出成功", outA.status === 202 && outA.job?.status === "success", outA.data?.message ?? outA.job?.error ?? "");
if (outA.job?.status === "success") {
  const expected = Math.min(15, Math.max(5, Math.ceil((ttsA.durationSeconds + 0.35) * 2) / 2));
  const actual = outA.job.totalFrames / 30;
  check("视频时长跟随配音（向上取 0.5 秒，不截断）", Math.abs(actual - expected) < 0.001, `${actual}s / 期望 ${expected}s`);
}

// 4) 短讲稿（<5 秒）仍按 5 秒
const scriptShort = "好。\n一。\n二。\n三。";
const ttsShort = await synth(scriptShort, 1, contentShort);
check("短讲稿音频不足 5 秒", ttsShort.durationSeconds < 5, `${ttsShort.durationSeconds}s`);
const outShort = await render({
  script: scriptShort,
  tts: ttsShort,
  speed: 1,
  ratio: "16:9",
  template: "editorial",
  content: contentShort,
  durationMode: "voice",
});
check("音频不足 5 秒时视频保持 5 秒", outShort.job?.status === "success" && outShort.job.totalFrames === 150, `${outShort.job?.totalFrames} 帧`);

// 5) 超长讲稿：应提示拆镜头
const scriptLong =
  "第一，先确定观众是谁，再决定讲什么。第二，把每个知识点拆成一句话，避免信息过载。\n" +
  "第三，用例子解释抽象概念，让听众有画面感。第四，控制每分钟的字数，留出停顿。\n" +
  "第五，字幕要跟声音同步，每屏不超过两行。第六，最后复盘结构，删掉重复的表达。\n" +
  "第七，导出前再听一遍，确认没有截断和爆音。";
const ttsLong = await synth(scriptLong, 1, contentLong);
check("长讲稿音频超过 15 秒", ttsLong.durationSeconds > 15, `${ttsLong.durationSeconds}s`);
const outLong = await render({
  script: scriptLong,
  tts: ttsLong,
  speed: 1,
  ratio: "9:16",
  template: "cards",
  content: contentLong,
  durationMode: "voice",
});
check(
  "超过 15 秒时导出被拒绝并给出拆镜头提示",
  outLong.status === 400 && /拆成多个镜头/.test(JSON.stringify(outLong.data?.errors ?? {})),
  outLong.data?.errors?.duration ?? outLong.data?.message,
);

// 6) 合并两支带配音字幕的视频
const outB = await render({
  script: scriptA,
  tts: ttsFast,
  speed: 1.25,
  ratio: "9:16",
  template: "split",
  content: contentA,
  durationMode: "voice",
});
check("第二支带配音视频导出成功", outB.job?.status === "success", outB.job?.error ?? "");

if (outA.job?.status === "success" && outB.job?.status === "success") {
  const merge = await post("/api/merge", {
    segmentIds: [outA.job.id, outB.job.id],
    ratio: "9:16",
    backgroundColor: "#0B1120",
  });
  const mergeJob = merge.status === 202 ? await poll(merge.data.job.id, "合并") : null;
  check("两支带配音视频合并成功", mergeJob?.status === "success", mergeJob?.error ?? "");
  if (mergeJob?.status === "success") {
    const expectedFrames = outA.job.totalFrames + outB.job.totalFrames;
    check("合并时长为两段之和（连接处不错位）", mergeJob.totalFrames === expectedFrames, `${mergeJob.totalFrames}/${expectedFrames}`);
    fs.writeFileSync(
      "voice-merge.json",
      JSON.stringify({ a: outA.job.id, b: outB.job.id, merge: mergeJob.id, framesA: outA.job.totalFrames, framesB: outB.job.totalFrames }, null, 2),
      "utf8",
    );
  }
}

if (outA.job?.status === "success") {
  fs.writeFileSync(
    "voice-export.json",
    JSON.stringify({ job: outA.job.id, tts: ttsA.id, duration: outA.job.totalFrames / 30, cues: ttsA.cues }, null, 2),
    "utf8",
  );
}

console.log(`\n通过 ${results.filter((r) => r.ok).length}/${results.length}`);
if (results.some((r) => !r.ok)) {
  process.exitCode = 1;
}
