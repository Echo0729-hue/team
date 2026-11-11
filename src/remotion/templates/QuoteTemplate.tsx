import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from "remotion";
import type { VideoProps } from "../params";
import { getActiveIndex, getTimeline } from "../timing";
import { analyzeLines } from "../illustrations/analyze";
import { SceneVisual } from "../illustrations/SceneVisual";
import { getVisualAnimation } from "../illustrations/visualAnimation";
import { CLAMP, FONT_SANS, FONT_SERIF, linesOf, paletteFor, useLayout, withAlpha } from "./theme";

/**
 * 模板五：金句海报
 * 大引号 + 居中标题；三段文案按时间轮播，每段配一张示意图并同步淡入淡出。
 */
export const QuoteTemplate: React.FC<VideoProps> = ({
  title,
  lines,
  backgroundColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, unit, pad, gap, portrait, width } = useLayout();
  const palette = paletteFor(backgroundColor);
  const safeLines = linesOf(lines);
  const tl = getTimeline(durationInFrames);

  const specs = analyzeLines({ title, lines: safeLines });
  const active = getActiveIndex(frame, tl);
  const visual = getVisualAnimation(frame, tl, active);

  const visualW = portrait ? Math.min(width * 0.4, 420) : Math.min(width * 0.24, 400);
  const visualH = visualW * 0.625;

  const outro = interpolate(frame, [tl.outroStart, tl.total - 1], [1, 0], CLAMP);
  const quoteIn = spring({
    frame,
    fps,
    config: { damping: 20, stiffness: 90 },
    durationInFrames: Math.max(12, tl.intro),
  });
  const titleIn = spring({
    frame: frame - Math.round(tl.intro * 0.25),
    fps,
    config: { damping: 26, stiffness: 80 },
    durationInFrames: Math.max(12, tl.intro),
  });

  const fade = Math.max(8, Math.round(tl.enter * 0.7));

  return (
    <AbsoluteFill style={{ backgroundColor, fontFamily: FONT_SANS, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(90% 70% at 50% 12%, ${withAlpha(accentColor, 0.16)} 0%, ${withAlpha(
            accentColor,
            0,
          )} 62%)`,
        }}
      />

      <AbsoluteFill style={{ opacity: outro, padding: pad * 0.85, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            fontFamily: FONT_SERIF,
            fontSize: (portrait ? 190 : 150) * unit,
            lineHeight: 0.72,
            color: accentColor,
            opacity: quoteIn * 0.9,
            transform: `scale(${0.8 + quoteIn * 0.2})`,
            transformOrigin: "left top",
          }}
        >
          “
        </div>

        <div
          style={{
            marginTop: gap * 0.5,
            textAlign: "center",
            fontSize: (portrait ? 80 : 68) * unit,
            lineHeight: 1.24,
            fontWeight: 700,
            letterSpacing: 2 * unit,
            color: palette.text,
            opacity: titleIn,
            transform: `translateY(${(1 - titleIn) * 24 * unit}px)`,
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
          }}
        >
          {title}
        </div>

        <div
          style={{
            marginTop: gap * 0.6,
            alignSelf: "center",
            width: 84 * unit,
            height: 2 * unit,
            backgroundColor: withAlpha(accentColor, 0.8),
            opacity: titleIn,
          }}
        />

        <div style={{ marginTop: gap * 0.8, alignSelf: "center" }}>
          <SceneVisual
            spec={specs[active]}
            accentColor={accentColor}
            palette={palette}
            width={visualW}
            height={visualH}
            enter={visual.enter}
            exit={visual.exit}
            pulse={visual.pulse}
          />
        </div>

        <div
          style={{
            marginTop: gap * 0.6,
            flex: 1,
            minHeight: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ position: "relative", width: "100%", maxWidth: portrait ? "100%" : "80%" }}>
            {safeLines.map((line, index) => {
              const start = tl.lineStarts[index];
              const end = index < 2 ? tl.lineStarts[index + 1] : tl.total - 1;
              const opacity = interpolate(
                frame,
                [start, start + fade, end - fade, end],
                [0, 1, 1, 0],
                CLAMP,
              );
              const rise = interpolate(frame, [start, start + fade], [20 * unit, 0], CLAMP);

              return (
                <div
                  key={index}
                  style={{
                    fontSize: (portrait ? 42 : 38) * unit,
                    lineHeight: 1.6,
                    textAlign: "center",
                    color: palette.secondary,
                    letterSpacing: unit,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    opacity,
                    transform: `translateY(${rise}px)`,
                    position: index === 0 ? "relative" : "absolute",
                    inset: index === 0 ? undefined : 0,
                  }}
                >
                  {line}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: gap * 0.4 }}>
          {safeLines.map((_, index) => (
            <span
              key={index}
              style={{
                width: index === active ? 26 * unit : 8 * unit,
                height: 8 * unit,
                borderRadius: 999,
                backgroundColor: index === active ? accentColor : withAlpha(palette.text, 0.22),
              }}
            />
          ))}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};