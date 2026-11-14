import type { VideoProps } from "@/remotion/params";

export type JobStatus = "queued" | "rendering" | "success" | "failed";

export type RenderJob = {
  id: string;
  status: JobStatus;
  /** 真实渲染进度（0~1），来自 Remotion 的 onProgress 回调 */
  progress: number;
  renderedFrames: number;
  totalFrames: number;
  queuePosition: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  fileSize: number | null;
  outputWidth: number | null;
  outputHeight: number | null;
  fileName: string;
  props: VideoProps;
  /** 视频名称（用户可自定义，写入素材库时去重） */
  name: string | null;
  kind: "single" | "merge";
  merge: { segmentIds: string[]; ratio: string; backgroundColor: string } | null;
};

type JobStore = Map<string, RenderJob>;

const globalStore = globalThis as typeof globalThis & {
  __codeVideoJobs?: JobStore;
};

const jobStore: JobStore = globalStore.__codeVideoJobs ?? new Map<string, RenderJob>();
globalStore.__codeVideoJobs = jobStore;

export const createJob = (
  props: VideoProps,
  totalFrames: number,
  options?: {
    kind?: "single" | "merge";
    merge?: { segmentIds: string[]; ratio: string; backgroundColor: string };
    name?: string;
  },
): RenderJob => {
  const id = crypto.randomUUID();
  const job: RenderJob = {
    id,
    status: "queued",
    progress: 0,
    renderedFrames: 0,
    totalFrames,
    queuePosition: 0,
    error: null,
    createdAt: new Date().toISOString(),
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    fileSize: null,
    outputWidth: null,
    outputHeight: null,
    fileName: `${id}.mp4`,
    props,
    name: options?.name ?? null,
    kind: options?.kind ?? "single",
    merge: options?.merge ?? null,
  };

  jobStore.set(id, job);
  recalculateQueuePositions();

  return job;
};

export const getJob = (id: string): RenderJob | undefined => jobStore.get(id);

/** Sources must remain available until every queued or running merge finishes. */
export const isVideoInUse = (id: string): boolean => [...jobStore.values()].some((job) =>
  (job.status === "queued" || job.status === "rendering") && job.merge?.segmentIds.includes(id));

export const isUploadInUse = (src: string): boolean => [...jobStore.values()].some((job) =>
  (job.status === "queued" || job.status === "rendering") &&
  job.props.layers.some((layer) => layer.kind === "image" && !layer.hidden && layer.src === src));

export const updateJob = (id: string, patch: Partial<RenderJob>): RenderJob | undefined => {
  const job = jobStore.get(id);
  if (!job) {
    return undefined;
  }
  Object.assign(job, patch);
  return job;
};

export const deleteJob = (id: string): void => {
  jobStore.delete(id);
};

/** 队首任务开始渲染后，刷新其余任务的排队序号 */
export const recalculateQueuePositions = (): void => {
  const queuedJobs = [...jobStore.values()]
    .filter((job) => job.status === "queued")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  for (const job of jobStore.values()) {
    job.queuePosition = 0;
  }
  queuedJobs.forEach((job, index) => {
    job.queuePosition = index + 1;
  });
};

/** 返回给浏览器的字段，避免直接暴露内部对象 */
export const toPublicJob = (job: RenderJob) => ({
  id: job.id,
  status: job.status,
  progress: job.progress,
  renderedFrames: job.renderedFrames,
  totalFrames: job.totalFrames,
  queuePosition: job.queuePosition,
  error: job.error,
  createdAt: job.createdAt,
  startedAt: job.startedAt,
  finishedAt: job.finishedAt,
  durationMs: job.durationMs,
  fileSize: job.fileSize ?? 0,
  outputWidth: job.outputWidth,
  outputHeight: job.outputHeight,
  fileName: job.fileName,
  props: job.props,
  name: job.name,
  kind: job.kind,
  merge: job.merge,
  videoUrl: job.status === "success" ? `/api/videos/${job.id}` : null,
  downloadUrl: job.status === "success" ? `/api/videos/${job.id}?download=1` : null,
});

export type PublicJob = ReturnType<typeof toPublicJob>;
