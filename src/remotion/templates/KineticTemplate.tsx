import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from "remotion";
import type { VideoProps } from "../params";
import { getActiveIndex, getTimeline } from "../timing";
import { analyzeLines } from "../illustrations/analyze";
import { SceneVisual } from "../illustrations/SceneVisual";
import { getVisualAnimation } from "../illustrations/visualAnimation";
import { CLAMP, FONT_SANS, linesOf, paletteFor, useLayout, withAlpha } from "./theme";

/**
 * 模板六：动感文字
 * 放大滑入 + 几何色块；示意图作为独立图块与文字交替出现，保持节奏。
 */
export const KineticTemplate: React.FC<VideoProps> = ({
  title,
  lines,
  backgroundColor,
  accentColor,
  narration,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, unit, pad, gap, width, height, portrait } = useLayout();
  const palette = paletteFor(backgroundColor);
  const safeLines = linesOf(lines);
  const tl = getTimeline(durationInFrames, narration);

  const specs = analyzeLines({ title, lines: safeLines });
  const active = getActiveIndex(frame, tl);
  const visual = getVisualAnimation(frame, tl, active);

  const visualW = portrait ? Math.min(width * 0.52, 480) : Math.min(width * 0.24, 380);
  const visualH = visualW * 0.625;

  const outro = interpolate(frame, [tl.outroStart, Math.max(tl.outroStart + 1, tl.total - 1)], [1, 0], CLAMP);
  const titlePunch = spring({
    frame,
    fps,
    config: { damping: 14, stiffness: 120, mass: 0.8 },
    durationInFrames: Math.max(10, tl.intro),
  });
  const titleClip = interpolate(frame, [0, Math.max(8, Math.round(tl.intro * 0.4))], [0, 1], CLAMP);

  const bandShift = interpolate(frame, [0, tl.total], [-width * 0.45, width * 0.1], CLAMP);
  const circleScale = spring({
    frame: frame - Math.round(tl.intro * 0.2),
    fps,
    config: { damping: 20, stiffness: 60 },
  });

  const visualBlock = (
    <div style={{ width: visualW, height: visualH, flex: "0 0 auto", alignSelf: portrait ? "center" : "center" }}>
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
  );

  return (
    <AbsoluteFill style={{ backgroundColor, fontFamily: FONT_SANS, overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          width: width * 1.2,
          height: height * 0.16,
          left: bandShift,
          top: height * 0.06,
          backgroundColor: withAlpha(accentColor, 0.16),
          transform: "rotate(-8deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: width * 0.9,
          height: height * 0.06,
          right: -width * 0.15,
          bottom: height * 0.14,
          backgroundColor: withAlpha(accentColor, 0.3),
          transform: "rotate(-8deg)",
        }}
      />
      <div
        style={{
          position: "absolute",
          right: -width * 0.1,
          top: -height * 0.08,
          width: width * 0.5,
          height: width * 0.5,
          borderRadius: "50%",
          border: `2px solid ${withAlpha(accentColor, 0.35)}`,
          transform: `scale(${0.85 + circleScale * 0.15})`,
        }}
      />

      <AbsoluteFill
        style={{
          padding: pad,
          display: "flex",
          flexDirection: portrait ? "column" : "row",
          alignItems: "center",
          justifyContent: "center",
          gap: gap * 1.2,
          opacity: outro,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          <div
            style={{
              fontSize: (portrait ? 88 : 76) * unit,
              lineHeight: 1.1,
              fontWeight: 900,
              letterSpacing: -1 * unit,
              color: palette.text,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              clipPath: `inset(0 ${(1 - titleClip) * 100}% 0 0)`,
              transform: `scale(${0.92 + titlePunch * 0.08})`,
              transformOrigin: "left center",
            }}
          >
            {title}
          </div>

          {portrait ? <div style={{ marginTop: gap * 1.2 }}>{visualBlock}</div> : null}

          <div style={{ marginTop: gap * 1.2, display: "flex", flexDirection: "column", gap: gap * 0.7 }}>
            {safeLines.map((line, index) => {
              const start = tl.lineStarts[index];
              const enter = spring({
                frame: frame - start,
                fps,
                config: { damping: 16, stiffness: 140, mass: 0.8 },
                durationInFrames: tl.enter + 8,
              });
              const opacity = interpolate(frame, [start, start + tl.enter], [0, 1], CLAMP);
              const fromLeft = index % 2 === 0;

              return (
                <div
                  key={index}
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: gap * 0.5,
                    opacity,
                    transform: `translateX(${(1 - enter) * (fromLeft ? -70 : 70) * unit}px)`,
                  }}
                >
                  <div
                    style={{
                      marginTop: 10 * unit,
                      width: 16 * unit,
                      height: 16 * unit,
                      flex: "0 0 auto",
                      backgroundColor: accentColor,
                      transform: `scale(${enter}) rotate(45deg)`,
                    }}
                  />
                  <div
                    style={{
                      flex: 1,
                      minWidth: 0,
                      fontSize: 36 * unit,
                      lineHeight: 1.48,
                      fontWeight: 600,
                      color: palette.secondary,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}
                  >
                    {line}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {portrait ? null : visualBlock}
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: "flex-end", opacity: outro }}>
        <div style={{ height: 4 * unit, backgroundColor: withAlpha(palette.text, 0.1) }}>
          <div
            style={{
              height: "100%",
              width: `${interpolate(frame, [0, tl.total - 1], [0, 100], CLAMP)}%`,
              backgroundColor: accentColor,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
