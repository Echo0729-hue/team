import React from "react";
import { Composition } from "remotion";
import { TextPromoVideo } from "./VideoTemplate";
import { MergeVideo } from "./MergeVideo";
import {
  DEFAULT_VIDEO_PROPS,
  VIDEO_CONFIG,
  getDurationInFrames,
  getVideoSize,
} from "./params";
import {
  DEFAULT_MERGE_PROPS,
  MERGE_COMPOSITION_ID,
  getMergeDurationInFrames,
  getMergeSize,
} from "./merge";

/**
 * Remotion 视频入口（打包器与 Studio 的根组件）。
 * 两个合成：
 * - TextPromo：单支文案视频，宽高与总帧数由 inputProps（比例、时长）计算；
 * - VideoMerge：拼接视频，尺寸与总帧数由片段列表计算。
 */
export const RemotionRoot: React.FC = () => {
  const size = getVideoSize(DEFAULT_VIDEO_PROPS);

  return (
    <>
      <Composition
        id={VIDEO_CONFIG.compositionId}
        component={TextPromoVideo}
        durationInFrames={getDurationInFrames(DEFAULT_VIDEO_PROPS)}
        fps={VIDEO_CONFIG.fps}
        width={size.width}
        height={size.height}
        defaultProps={DEFAULT_VIDEO_PROPS}
        calculateMetadata={({ props }) => {
          const { width, height } = getVideoSize(props);
          return {
            width,
            height,
            durationInFrames: getDurationInFrames(props),
            fps: VIDEO_CONFIG.fps,
          };
        }}
      />

      <Composition
        id={MERGE_COMPOSITION_ID}
        component={MergeVideo}
        durationInFrames={1}
        fps={VIDEO_CONFIG.fps}
        width={1080}
        height={1920}
        defaultProps={DEFAULT_MERGE_PROPS}
        calculateMetadata={({ props }) => {
          const { width, height } = getMergeSize(props);
          return {
            width,
            height,
            durationInFrames: getMergeDurationInFrames(props),
            fps: VIDEO_CONFIG.fps,
          };
        }}
      />
    </>
  );
};