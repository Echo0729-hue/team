import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { SubtitleProps } from "./subtitles";
import { CLAMP, FONT_SANS } from "./templates/theme";

/**
 * 字幕轨道：按配音时间轴逐屏显示，最多两行，带安全边距。
 * 预览与导出使用同一份 cues（来自语音服务每句真实时长）。
 */
export const SubtitleTrack: React.FC<{ subtitles: SubtitleProps }> = ({ subtitles }) => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();

  const cue = subtitles.cues.find((item) => frame >= item.startFrame && frame < item.endFrame);
  if (!cue) {
    return null;
  }

  const unit = Math.min(width, height) / 1080;
  const fontSize = Math.round(46 * unit * subtitles.fontScale);
  const maxWidth = Math.min(width * 0.84, 1180 * unit);
  const fadeIn = interpolate(frame, [cue.startFrame, cue.startFrame + 4], [0, 1], CLAMP);
  const fadeOut = interpolate(frame, [cue.endFrame - 5, cue.endFrame], [1, 0], CLAMP);
  const opacity = Math.max(0, Math.min(fadeIn, fadeOut));

  const anchorStyle =
    subtitles.position === "bottom"
      ? { bottom: Math.round(height * 0.085) }
      : { top: Math.round(height * 0.58) };

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          padding: `0 ${Math.round(width * 0.07)}px`,
          ...anchorStyle,
        }}
      >
        <div
          style={{
            maxWidth,
            padding: `${Math.round(14 * unit)}px ${Math.round(24 * unit)}px`,
            borderRadius: Math.round(14 * unit),
            backgroundColor: `rgba(6, 10, 18, ${subtitles.backgroundOpacity})`,
            color: subtitles.color,
            fontFamily: FONT_SANS,
            fontSize,
            lineHeight: 1.45,
            fontWeight: 600,
            letterSpacing: 0.5 * unit,
            textAlign: "center",
            whiteSpace: "pre-line",
            textShadow: "0 2px 10px rgba(0, 0, 0, 0.45)",
            opacity,
            transform: `translateY(${(1 - fadeIn) * 8 * unit}px)`,
            backdropFilter: subtitles.backgroundOpacity > 0 ? "blur(2px)" : undefined,
          }}
        >
          {cue.lines.length > 0 ? cue.lines.join("\n") : cue.text}
        </div>
      </div>
    </AbsoluteFill>
  );
};