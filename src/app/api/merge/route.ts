import { NextResponse } from "next/server";
import { DEFAULT_MERGE_PROPS, type MergeProps } from "@/remotion/merge";
import {
  DEFAULT_VIDEO_PROPS,
  VIDEO_CONFIG,
  isRatioId,
  isTemplateId,
  type VideoProps,
} from "@/remotion/params";
import { createJob, toPublicJob } from "@/lib/jobs";
import { getLibraryItem, type LibraryItem } from "@/lib/library";
import { enqueueRender } from "@/lib/renderQueue";
import { sanitizeVideoName } from "@/lib/videoName";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

const toVideoProps = (segments: LibraryItem[], ratioValue: MergeProps["ratio"]): VideoProps => {
  const lines = segments.slice(0, 3).map((segment) => segment.title);
  while (lines.length < 3) {
    lines.push(`片段 ${lines.length + 1}`);
  }

  const totalSeconds = segments.reduce((total, segment) => total + segment.durationInSeconds, 0);

  return {
    ...DEFAULT_VIDEO_PROPS,
    title: `拼接视频（${segments.length} 段）`,
    lines,
    template: isTemplateId(segments[0]?.template)
      ? segments[0].template
      : DEFAULT_VIDEO_PROPS.template,
    ratio: ratioValue,
    durationInSeconds: Math.round(totalSeconds * 10) / 10,
  };
};

/** 创建拼接任务：按传入顺序首尾相接，交给串行队列真实渲染 */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  if (typeof payload !== "object" || payload === null) {
    return NextResponse.json({ message: "请求体格式不正确。" }, { status: 400 });
  }

  const body = payload as {
    segmentIds?: unknown;
    ratio?: unknown;
    backgroundColor?: unknown;
    name?: unknown;
  };

  if (!Array.isArray(body.segmentIds) || body.segmentIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ message: "请提供拼接片段列表。" }, { status: 400 });
  }

  const segmentIds = body.segmentIds as string[];
  const uniqueIds = [...new Set(segmentIds)];

  if (uniqueIds.length < 2) {
    return NextResponse.json({ message: "至少选择 2 个片段才能拼接。" }, { status: 400 });
  }
  if (uniqueIds.length !== segmentIds.length) {
    return NextResponse.json({ message: "拼接列表中存在重复片段。" }, { status: 400 });
  }

  const segments: LibraryItem[] = [];
  for (const id of uniqueIds) {
    const item = getLibraryItem(id);
    if (!item) {
      return NextResponse.json({ message: `片段不存在或文件已被删除：${id}` }, { status: 400 });
    }
    segments.push(item);
  }

  const requestedRatio = body.ratio;
  if (requestedRatio !== undefined && !isRatioId(requestedRatio)) {
    return NextResponse.json({ message: "输出比例不合法。" }, { status: 400 });
  }

  // 默认沿用第一个片段的比例，保证画面不被强行裁切
  const ratioValue = isRatioId(requestedRatio) ? requestedRatio : segments[0].ratio;

  const requestedBackground = body.backgroundColor;
  if (requestedBackground !== undefined && !HEX_COLOR.test(String(requestedBackground))) {
    return NextResponse.json({ message: "背景色需为 #RRGGBB 格式。" }, { status: 400 });
  }
  const backgroundColor = HEX_COLOR.test(String(requestedBackground))
    ? String(requestedBackground)
    : DEFAULT_MERGE_PROPS.backgroundColor;

  const totalFrames = segments.reduce((total, segment) => total + segment.durationInFrames, 0);
  if (totalFrames <= 0) {
    return NextResponse.json({ message: "片段时长无效，无法拼接。" }, { status: 400 });
  }

  const job = createJob(toVideoProps(segments, ratioValue), totalFrames, {
    kind: "merge",
    merge: { segmentIds: uniqueIds, ratio: ratioValue, backgroundColor },
    name: sanitizeVideoName(
      typeof body.name === "string" ? body.name : "",
      `拼接视频 · ${segments.length} 段`,
    ),
  });

  enqueueRender(job);

  return NextResponse.json({ job: toPublicJob(job), fps: VIDEO_CONFIG.fps }, { status: 202 });
}