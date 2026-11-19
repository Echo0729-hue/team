import fs from "node:fs";
import path from "node:path";
import { createDemoDraft, demoVideoProps, DEMO_SAMPLES, DEMO_VERSION, type DemoManifest, type DemoStatus } from "../demo/projects";
import { getTtsRecord, listTtsVoices, synthesizeNarration } from "./tts";
import { saveUpload } from "./uploads";
import { getLibraryItem } from "./library";
import { createJob, type RenderJob } from "./jobs";
import { enqueueRender } from "./renderQueue";
import { prepareNarratedVideo } from "./narrationValidation";
import { getDurationInFrames, validateVideoInput } from "../remotion/params";

const directory = path.join(process.cwd(), "output", "demo");
const manifestFile = path.join(directory, "manifest.json");
const empty = (): DemoManifest => ({ version: DEMO_VERSION, samples: {} });
type State = { status: DemoStatus["status"]; message: string; progress: number; running?: Promise<void>; job?: RenderJob; base: number };
const globalDemo = globalThis as typeof globalThis & { __codevideoDemo?: State };
const state = globalDemo.__codevideoDemo ??= { status: "idle", message: "准备三个带配音和字幕的样片，以及一条拼接成片。", progress: 0, base: 0 };

function readManifest(): DemoManifest {
  try {
    const saved = JSON.parse(fs.readFileSync(manifestFile, "utf8")) as DemoManifest;
    if (saved.version !== DEMO_VERSION || !saved.samples) return empty();
    for (const sample of DEMO_SAMPLES) {
      const item = saved.samples[sample.id];
      const missingImage = item?.draft.layers.some(layer => layer.kind === "image" && !fs.existsSync(path.join(process.cwd(), "output", "uploads", path.basename(layer.src))));
      if (item && (!getLibraryItem(item.videoId) || !getTtsRecord(item.draft.ttsId ?? "") || missingImage)) delete saved.samples[sample.id];
    }
    if (saved.mergedId && !getLibraryItem(saved.mergedId)) delete saved.mergedId;
    if (saved.boardUrl && !fs.existsSync(path.join(process.cwd(), "output", "uploads", path.basename(saved.boardUrl)))) delete saved.boardUrl;
    if (DEMO_SAMPLES.some(sample => !saved.samples[sample.id])) delete saved.mergedId;
    return saved;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return empty();
    throw new Error("演示记录读取失败，请保留 output/demo/manifest.json 并检查文件内容。");
  }
}
function save(manifest: DemoManifest) {
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(`${manifestFile}.tmp`, JSON.stringify(manifest, null, 2));
  fs.renameSync(`${manifestFile}.tmp`, manifestFile);
}
export function getDemoStatus(): DemoStatus {
  const manifest = readManifest();
  const complete = DEMO_SAMPLES.every(s => manifest.samples[s.id]) && !!manifest.mergedId && !!manifest.boardUrl;
  return {
    status: state.running ? "preparing" : complete ? "ready" : state.status === "failed" ? "failed" : "idle",
    message: state.running ? state.message : complete ? "三个配音样片与拼接成片已就绪，可以载入示例或自由编辑。" : state.message,
    progress: complete && !state.running ? 1 : Math.min(.99, state.job ? state.base + state.job.progress * .2 : state.progress), manifest,
  };
}
async function render(job: RenderJob) {
  state.job = job;
  enqueueRender(job);
  while (job.status === "queued" || job.status === "rendering") await new Promise(resolve => setTimeout(resolve, 500));
  if (job.status !== "success") throw new Error(job.error ?? "演示视频生成失败，请重试。");
  state.job = undefined;
  return job.id;
}
async function prepare() {
  const manifest = readManifest();
  state.message = "正在检查中文配音环境…";
  const { config, voices } = await listTtsVoices();
  const voice = voices.find(v => v.provider === "local" && /^zh/i.test(v.lang)) ?? voices.find(v => /^zh/i.test(v.lang)) ?? voices[0];
  if (!voice) throw new Error(config.message);
  if (!manifest.boardUrl) {
    state.message = "正在创建可编辑的图片素材…";
    const buffer = await fs.promises.readFile(path.join(process.cwd(), "public", "demo", "lesson-board.png"));
    const uploaded = await saveUpload(new File([new Uint8Array(buffer)], "数学演示板.png", { type: "image/png" }));
    if (!uploaded.ok) throw new Error(uploaded.message);
    manifest.boardUrl = uploaded.upload.url;
    save(manifest);
  }
  for (const [index, sample] of DEMO_SAMPLES.entries()) {
    state.base = .1 + index * .22; state.progress = state.base;
    if (manifest.samples[sample.id]) continue;
    const draft = createDemoDraft(sample.id, sample.id === "math" ? manifest.boardUrl : undefined);
    state.message = `正在合成「${sample.name}」的真实配音与字幕…`;
    const narration = await synthesizeNarration({ script: draft.script, voiceId: voice.id, speed: draft.speed,
      content: { title: draft.values.title, lines: [draft.values.line0, draft.values.line1, draft.values.line2] } });
    if (narration.durationSeconds > 14.7) throw new Error(`「${sample.name}」配音超过 15 秒，请使用更快的中文音色后重试。`);
    draft.voiceEnabled = true; draft.ttsId = narration.id; draft.voiceId = narration.voiceId;
    const checked = validateVideoInput(demoVideoProps(draft, narration));
    if (!checked.ok) throw new Error(Object.values(checked.errors).join(" "));
    const props = prepareNarratedVideo(checked.value, narration);
    state.message = `正在渲染「${sample.name}」${sample.id === "math" ? "（含真实 Manim 动画）" : ""}…`;
    const videoId = await render(createJob(props, getDurationInFrames(props), { name: draft.videoName }));
    manifest.samples[sample.id] = { draft, videoId };
    save(manifest);
  }
  if (!manifest.mergedId) {
    state.base = .78; state.message = "正在按顺序拼接三个样片，保留配音与字幕…";
    const segmentIds = DEMO_SAMPLES.map(s => manifest.samples[s.id]!.videoId);
    const items = segmentIds.map(id => getLibraryItem(id)!);
    const voiceRecord = getTtsRecord(manifest.samples.math!.draft.ttsId!)!;
    const props = { ...demoVideoProps(manifest.samples.math!.draft, voiceRecord), durationInSeconds: items.reduce((n, item) => n + item.durationInSeconds, 0) };
    manifest.mergedId = await render(createJob(props, items.reduce((n, item) => n + item.durationInFrames, 0), {
      kind: "merge", name: "Demo · 完整演示合集", merge: { segmentIds, ratio: "16:9", backgroundColor: "#101D2B" },
    }));
    save(manifest);
  }
  state.status = "ready"; state.progress = 1;
}
/** One shared preparation task; repeated clicks reuse completed assets and never clear the library. */
export function startDemoPreparation(): DemoStatus {
  if (state.running || getDemoStatus().status === "ready") return getDemoStatus();
  state.status = "preparing"; state.progress = 0; state.base = 0; state.job = undefined;
  state.running = prepare().catch((error: unknown) => {
    state.status = "failed"; state.message = error instanceof Error ? error.message : "演示素材生成失败，请重试。";
  }).finally(() => { state.running = undefined; state.job = undefined; });
  return getDemoStatus();
}
