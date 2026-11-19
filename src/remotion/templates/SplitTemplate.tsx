import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from "remotion";
import type { VideoProps } from "../params";
import { getActiveIndex, getTimeline } from "../timing";
import { analyzeLines } from "../illustrations/analyze";
import { SceneVisual } from "../illustrations/SceneVisual";
import { getVisualAnimation } from "../illustrations/visualAnimation";
import { CLAMP, FONT_SANS, linesOf, paletteFor, useLayout, withAlpha } from "./theme";

/**
 * 模板四：分栏展示
 * 标题区与内容区分开：横屏左右分栏、竖屏上下分栏；示意图位于内容区顶部。
 */
export const SplitTemplate: React.FC<VideoProps> = ({
  title,
  lines,
  backgroundColor,
  accentColor,
  narration,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, unit, pad, gap, portrait, width, short } = useLayout();
  const palette = paletteFor(backgroundColor);
  const safeLines = linesOf(lines);
  const tl = getTimeline(durationInFrames, narration);

  const specs = analyzeLines({ title, lines: safeLines });
  const active = getActiveIndex(frame, tl);
  const visual = getVisualAnimation(frame, tl, active);

  const visualW = Math.min(width * (portrait ? 0.5 : 0.24), portrait ? 460 : 360);
  const visualH = visualW * 0.625;

  const outro = interpolate(frame, [tl.outroStart, Math.max(tl.outroStart + 1, tl.total - 1)], [1, 0], CLAMP);
  const panelIn = spring({
    frame,
    fps,
    config: { damping: 26, stiffness: 86, mass: 1 },
    durationInFrames: Math.max(14, tl.intro),
  });
  const titleReveal = spring({
    frame: frame - Math.round(tl.intro * 0.2),
    fps,
    config: { damping: 26, stiffness: 80 },
    durationInFrames: Math.max(12, tl.intro),
  });

  return (
    <AbsoluteFill style={{ backgroundColor, fontFamily: FONT_SANS, overflow: "hidden" }}>
      <AbsoluteFill style={{ display: "flex", flexDirection: portrait ? "column" : "row", opacity: outro }}>
        <div
          style={{
            flex: portrait ? "0 0 33%" : "0 0 36%",
            minWidth: 0,
            minHeight: 0,
            padding: `${pad * 0.72}px`,
            background: `linear-gradient(150deg, ${withAlpha(accentColor, 0.24)} 0%, ${withAlpha(
              accentColor,
              0.07,
            )} 100%)`,
            borderRight: portrait ? "none" : `1px solid ${withAlpha(accentColor, 0.32)}`,
            borderBottom: portrait ? `1px solid ${withAlpha(accentColor, 0.32)}` : "none",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
            transform: portrait
              ? `translateY(${(1 - panelIn) * -40 * unit}px)`
              : `translateX(${(1 - panelIn) * -48 * unit}px)`,
            opacity: panelIn,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: gap * 0.5 }}>
            <span style={{ fontSize: 14 * unit, letterSpacing: 4 * unit, color: palette.text, opacity: 0.62 }}>
              TITLE
            </span>
            <span style={{ flex: 1, height: 1, backgroundColor: withAlpha(palette.text, 0.24) }} />
          </div>

          <div
            style={{
              marginTop: gap,
              fontSize: (portrait ? 60 : 52) * unit,
              lineHeight: 1.2,
              fontWeight: 800,
              letterSpacing: unit,
              color: palette.text,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              clipPath: `inset(${(1 - titleReveal) * 100}% 0 0 0)`,
            }}
          >
            {title}
          </div>

          <div style={{ marginTop: gap, display: "flex", alignItems: "center", gap: gap * 0.5 }}>
            <div
              style={{
                width: 54 * unit,
                height: 6 * unit,
                borderRadius: 999,
                backgroundColor: accentColor,
                transform: `scaleX(${Math.max(0.001, titleReveal)})`,
                transformOrigin: "left center",
              }}
            />
            <span style={{ fontSize: 14 * unit, letterSpacing: 2 * unit, color: withAlpha(palette.text, 0.6) }}>
              {(durationInFrames / fps).toFixed(0)} SEC
            </span>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 0,
            padding: `${pad * 0.72}px`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            gap: gap * 0.4,
          }}
        >
          <div style={{ flex: "0 0 auto", alignSelf: portrait ? "center" : "flex-end", height: visualH, width: visualW, marginBottom: gap * 0.4 }}>
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

          {safeLines.map((line, index) => {
            const start = tl.lineStarts[index];
            const enter = spring({
              frame: frame - start,
              fps,
              config: { damping: 24, stiffness: 100 },
              durationInFrames: tl.enter + 8,
            });
            const opacity = interpolate(frame, [start, start + tl.enter], [0, 1], CLAMP);

            return (
              <div
                key={index}
                style={{
                  display: "flex",
                  gap: gap * 0.6,
                  paddingTop: gap * 0.5,
                  paddingBottom: gap * 0.5,
                  borderTop: index === 0 ? "none" : `1px solid ${palette.hairline}`,
                  opacity,
                  transform: portrait
                    ? `translateY(${(1 - enter) * 26 * unit}px)`
                    : `translateX(${(1 - enter) * 40 * unit}px)`,
                }}
              >
                <div
                  style={{
                    minWidth: 38 * unit,
                    fontSize: 17 * unit,
                    fontWeight: 700,
                    letterSpacing: 2 * unit,
                    color: accentColor,
                    paddingTop: 6 * unit,
                  }}
                >
                  {`0${index + 1}`}
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 32 * unit,
                    lineHeight: 1.55,
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
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
