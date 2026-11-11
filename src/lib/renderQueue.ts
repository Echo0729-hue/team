import fs from "node:fs";
import path from "node:path";
import { renderMedia, selectComposition } from "@remotion/renderer";
import { VIDEO_CONFIG, type RatioId, type VideoProps } from "@/remotion/params";
import { MERGE_COMPOSITION_ID, type MergeProps } from "@/remotion/merge";
import { getBundleServer } from "./bundleServer";
import { getRenderPort } from "./renderPort";
import { addLibraryItem, getLibraryItem } from "./library";
import { getTtsRecord } from "./tts";
import { resolveUploadPath } from "./uploads";
import { recalculateQueuePositions, updateJob, type RenderJob } from "./jobs";

/** 导出文件写入项目根目录下的 output/ */
export const OUTPUT_DIR = path.join(process.cwd(), "output");
export const BUNDLE_ENTRY_POINT = path.join(process.cwd(), "src", "remotion", "index.ts");

export const getOutputPath = (fileName: string): string => path.join(OUTPUT_DIR, fileName);

const BROWSER_CANDIDATES = [
  process.env.REMOTION_BROWSER_EXECUTABLE,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

/**
 * Remotion 默认会下载 Chrome Headless Shell。
 * 这里优先复用本机已安装的 Chrome / Edge，未配置时回退到 Remotion 自动下载。
 */
const resolveBrowserExecutable = (): string | undefined => {
  const envValue = process.env.REMOTION_BROWSER_EXECUTABLE;
  if (envValue) {
    return envValue;
  }
  return BROWSER_CANDIDATES.filter((candidate): candidate is string => Boolean(candidate)).find(
    (candidate) => fs.existsSync(candidate),
  );
};

const browserExecutable = resolveBrowserExecutable();

type QueueState = {
  chain: Promise<void>;
};

const globalQueue = globalThis as typeof globalThis & {
  __codeVideoRenderQueue?: QueueState;
};

const queueState: QueueState = globalQueue.__codeVideoRenderQueue ?? { chain: Promise.resolve() };
globalQueue.__codeVideoRenderQueue = queueState;

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};

/**
 * 渲染时把配音地址换成 bundle 静态服务上的绝对地址，
 * 浏览器里预览则用 /api/tts/<id>/audio —— 两份地址指向同一个 WAV 文件。
 */
const withRenderableNarration = (job: RenderJob, serveUrl: string): VideoProps => {
  const narration = job.props.narration;
  if (!narration?.enabled) {
    return job.props;
  }
  if (!narration.ttsId) {
    throw new Error("已开启配音但缺少音频记录，请重新生成配音。");
  }
  const record = getTtsRecord(narration.ttsId);
  if (!record) {
    throw new Error("配音文件不存在，请重新生成配音后再导出。");
  }
  return {
    ...job.props,
    narration: {
      ...narration,
      audioSrc: `${serveUrl}/tts/${encodeURIComponent(record.fileName)}`,
      audioDurationSeconds: record.durationSeconds,
    },
  };
};

/**
 * 渲染时把图层里的图片指向 bundle 静态服务的 /uploads，
 * 并确认文件真实存在，避免导出时才报错或出现空白图。
 */
const withRenderableLayers = (props: VideoProps, serveUrl: string): VideoProps => {
  const layers = props.layers ?? [];
  if (layers.length === 0) {
    return props;
  }

  const rewritten = layers.map((layer) => {
    if (layer.kind !== "image") {
      return layer;
    }
    const fileName = layer.src.split("/").pop() ?? "";
    if (!fileName) {
      throw new Error(`图层「${layer.name}」的图片地址无效。`);
    }
    const filePath = resolveUploadPath(fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`图层「${layer.name}」的图片文件不存在，请重新上传。`);
    }
    return { ...layer, src: `${serveUrl}/uploads/${encodeURIComponent(fileName)}` };
  });

  return { ...props, layers: rewritten };
};

const buildMergeProps = (job: RenderJob, serveUrl: string): MergeProps => {
  const segmentIds = job.merge?.segmentIds ?? [];
  const segments = segmentIds.map((id) => {
    const item = getLibraryItem(id);
    if (!item) {
      throw new Error(`拼接片段不存在：${id}`);
    }
    return {
      id,
      // 静态服务把 /media/<file> 映射到 output 目录
      src: `${serveUrl}/media/${encodeURIComponent(item.fileName)}`,
      durationInFrames: item.durationInFrames,
    };
  });

  if (segments.length === 0) {
    throw new Error("拼接片段为空，请先选择视频。");
  }

  return {
    segments,
    backgroundColor: job.merge?.backgroundColor ?? "#0B1120",
    ratio: (job.merge?.ratio ?? job.props.ratio) as RatioId,
  };
};

const runJob = async (job: RenderJob): Promise<void> => {
  const totalFrames = job.totalFrames;
  updateJob(job.id, {
    status: "rendering",
    startedAt: new Date().toISOString(),
    queuePosition: 0,
  });
  recalculateQueuePositions();

  const startedAtMs = Date.now();

  try {
    await fs.promises.mkdir(OUTPUT_DIR, { recursive: true });

    const serveUrl = (await getBundleServer(BUNDLE_ENTRY_POINT)).serveUrl;
    // 仅用于 Remotion 内部的 OffthreadVideo 代理服务，避免占用 3000 端口
    const port = await getRenderPort();

    const isMerge = job.kind === "merge";
    const inputProps = isMerge
      ? buildMergeProps(job, serveUrl)
      : withRenderableLayers(withRenderableNarration(job, serveUrl), serveUrl);
    const compositionId = isMerge ? MERGE_COMPOSITION_ID : VIDEO_CONFIG.compositionId;

    const composition = await selectComposition({
      serveUrl,
      port,
      id: compositionId,
      inputProps,
      browserExecutable,
    });

    // 记录 selectComposition 计算出的真实尺寸，用于结果面板展示
    updateJob(job.id, {
      outputWidth: composition.width,
      outputHeight: composition.height,
    });

    await renderMedia({
      composition,
      serveUrl,
      port,
      codec: "h264",
      outputLocation: getOutputPath(job.fileName),
      inputProps,
      browserExecutable,
      // 单机串行任务已限制并发，这里再给渲染器一个温和的上限
      concurrency: 2,
      // 拼接时若没有音轨则补齐静音，保证音画同步
      enforceAudioTrack: isMerge,
      onProgress: ({ progress, renderedFrames }) => {
        updateJob(job.id, {
          progress: Math.min(1, Math.max(0, progress)),
          renderedFrames: Math.min(totalFrames, renderedFrames),
        });
      },
    });

    let fileSize = 0;
    try {
      fileSize = (await fs.promises.stat(getOutputPath(job.fileName))).size;
    } catch {
      fileSize = 0;
    }

    const finishedAt = new Date().toISOString();
    updateJob(job.id, {
      status: "success",
      progress: 1,
      renderedFrames: totalFrames,
      finishedAt,
      durationMs: Date.now() - startedAtMs,
      fileSize,
      error: null,
    });

    const segmentCount = isMerge ? (job.merge?.segmentIds.length ?? 1) : 1;
    const durationInSeconds = isMerge
      ? Math.round((totalFrames / VIDEO_CONFIG.fps) * 10) / 10
      : job.props.durationInSeconds;
    const title = isMerge ? `拼接视频 · ${segmentCount} 段` : job.props.title;

    addLibraryItem({
      id: job.id,
      name: job.name?.trim() ? job.name : title,
      title,
      fileName: job.fileName,
      width: composition.width,
      height: composition.height,
      durationInSeconds,
      durationInFrames: totalFrames,
      template: job.props.template,
      ratio: (isMerge ? (job.merge?.ratio as RatioId) : job.props.ratio) ?? job.props.ratio,
      kind: isMerge ? "merge" : "single",
      hasNarration: !isMerge && job.props.narration.enabled,
      hasSubtitles: job.props.subtitles.enabled && job.props.subtitles.cues.length > 0,
      segmentCount,
      fileSize,
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    updateJob(job.id, {
      status: "failed",
      error: toErrorMessage(error),
      finishedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAtMs,
    });
  }
};

/**
 * 串行执行：新的任务追加到 Promise 链尾部，前一个任务结束后才开始下一个，
 * 避免多个 Chrome + 编码进程同时跑满 CPU/内存。
 */
export const enqueueRender = (job: RenderJob): void => {
  queueState.chain = queueState.chain
    .then(() => runJob(job))
    .catch((error: unknown) => {
      console.error("[render-queue] 队列异常:", error);
    });
};