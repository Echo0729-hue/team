import type { RatioId } from "./params";
import { getVideoSize } from "./params";

/** 拼接合成：片段按顺序首尾相接，尺寸统一到目标比例 */
export const MERGE_COMPOSITION_ID = "VideoMerge";

export type MergeSegment = {
  id: string;
  /** 渲染时是可访问的媒体 URL，预览时是 /api/videos/<id> */
  src: string;
  durationInFrames: number;
};

export type MergeProps = {
  segments: MergeSegment[];
  backgroundColor: string;
  ratio: RatioId;
};

export const getMergeDurationInFrames = (props: Pick<MergeProps, "segments">): number =>
  Math.max(1, props.segments.reduce((total, segment) => total + segment.durationInFrames, 0));

export const getMergeSize = (props: Pick<MergeProps, "ratio">) => getVideoSize(props);

export const DEFAULT_MERGE_PROPS: MergeProps = {
  segments: [],
  backgroundColor: "#0B1120",
  ratio: "9:16",
};