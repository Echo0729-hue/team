import React from "react";
import { AbsoluteFill, OffthreadVideo, Sequence, useVideoConfig } from "remotion";
import type { MergeProps } from "./merge";

/**
 * 拼接合成：按顺序播放各片段。
 * 每个片段等比缩放后居中，剩余空间填背景色；有音频的保留原声，无音频即静音，
 * 渲染时通过 enforceAudioTrack 补齐一条静音轨，保证音画同步。
 */
export const MergeVideo: React.FC<MergeProps> = ({ segments, backgroundColor }) => {
  useVideoConfig(); // 保证在 Composition 上下文中渲染

  let cursor = 0;

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {segments.map((segment, index) => {
        const from = cursor;
        cursor += segment.durationInFrames;

        return (
          <Sequence
            key={`${segment.id}-${index}-${from}`}
            from={from}
            durationInFrames={segment.durationInFrames}
          >
            <AbsoluteFill style={{ backgroundColor, overflow: "hidden" }}>
              <OffthreadVideo
                src={segment.src}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                }}
              />
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};