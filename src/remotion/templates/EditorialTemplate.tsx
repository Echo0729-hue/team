import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from "remotion";
import type { VideoProps } from "../params";
import { getActiveIndex, getTimeline } from "../timing";
import { analyzeLines } from "../illustrations/analyze";
import { SceneVisual } from "../illustrations/SceneVisual";
import { getVisualAnimation } from "../illustrations/visualAnimation";
import { CLAMP, FONT_SANS, FONT_SERIF, linesOf, paletteFor, useLayout, withAlpha } from "./theme";

/**
 * 模板二：极简杂志
 * 衬线大标题、细线与留白；示意图以细线风格放在标题下方或右侧栏。
 */
export const EditorialTemplate: React.FC<VideoProps> = ({
  title,
  lines,
  backgroundColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, unit, pad, gap, width, portrait } = useLayout();
  const palette = paletteFor(backgroundColor);
  const safeLines = linesOf(lines);
  const tl = getTimeline(durationInFrames);

  const specs = analyzeLines({ title, lines: safeLines });
  const active = getActiveIndex(frame, tl);
  const visual = getVisualAnimation(frame, tl, active);

  const visualW = portrait ? Math.min(width * 0.48, 470) : Math.min(width * 0.24, 380);
  const visualH = visualW * 0.625;

  const outro = interpolate(frame, [tl.outroStart, tl.total - 1], [1, 0], CLAMP);
  const titleReveal = spring({
    frame,
    fps,
    config: { damping: 30, stiffness: 70, mass: 1 },
    durationInFrames: Math.max(14, tl.intro),
  });
  const ruleGrow = spring({
    frame: frame - Math.round(tl.intro * 0.3),
    fps,
    config: { damping: 30, stiffness: 60 },
  });

  const textColumn = (
    <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: gap * 0.6,
          paddingBottom: gap,
          borderBottom: `1px solid ${palette.hairline}`,
        }}
      >
        <div style={{ width: 3 * unit, height: 24 * unit, backgroundColor: accentColor }} />
        <div
          style={{
            fontFamily: FONT_SERIF,
            fontSize: 17 * unit,
            letterSpacing: 6 * unit,
            color: palette.muted,
          }}
        >
          EDITORIAL
        </div>
        <div style={{ marginLeft: "auto", fontSize: 15 * unit, letterSpacing: 3 * unit, color: palette.muted }}>
          {(durationInFrames / fps).toFixed(0)} SEC
        </div>
      </div>

      <div style={{ marginTop: gap * 1.6 }}>
        <div
          style={{
            fontFamily: FONT_SERIF,
            fontSize: (portrait ? 88 : 74) * unit,
            lineHeight: 1.14,
            fontWeight: 700,
            letterSpacing: unit,
            color: palette.text,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            clipPath: `inset(${(1 - titleReveal) * 100}% 0 0 0)`,
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: gap * 0.9,
            height: 1,
            width: `${Math.min(1, Math.max(0, ruleGrow)) * 72}%`,
            backgroundColor: accentColor,
            opacity: 0.85,
          }}
        />
      </div>

      <div style={{ marginTop: gap * 1.6, display: "flex", flexDirection: "column" }}>
        {safeLines.map((line, index) => {
          const start = tl.lineStarts[index];
          const rise = spring({
            frame: frame - start,
            fps,
            config: { damping: 30, stiffness: 80 },
            durationInFrames: tl.enter + 10,
          });
          const opacity = interpolate(frame, [start, start + tl.enter], [0, 1], CLAMP);
          const rule = interpolate(frame, [start, start + tl.enter + 8], [0, 1], CLAMP);

          return (
            <div
              key={index}
              style={{
                paddingTop: gap * 0.7,
                paddingBottom: gap * 0.7,
                borderTop: index === 0 ? "none" : `1px solid ${palette.hairline}`,
                transform: `translateY(${(1 - rise) * 22 * unit}px)`,
                opacity,
              }}
            >
              <div style={{ display: "flex", gap: gap * 0.8, alignItems: "baseline" }}>
                <div
                  style={{
                    fontFamily: FONT_SERIF,
                    fontSize: 20 * unit,
                    color: accentColor,
                    letterSpacing: 2 * unit,
                    minWidth: 46 * unit,
                  }}
                >
                  {`0${index + 1}`}
                </div>
                <div
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 36 * unit,
                    lineHeight: 1.6,
                    color: palette.secondary,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  {line}
                </div>
              </div>
              <div
                style={{
                  marginTop: gap * 0.5,
                  height: 1,
                  width: 64 * unit,
                  backgroundColor: withAlpha(accentColor, 0.7),
                  transform: `scaleX(${rule})`,
                  transformOrigin: "left center",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );

  const visualBlock = (
    <div
      style={{
        width: visualW,
        height: visualH,
        flex: "0 0 auto",
        alignSelf: portrait ? "flex-start" : "center",
        marginTop: portrait ? gap * 1.2 : 0,
        marginBottom: portrait ? gap * 1.2 : 0,
      }}
    >
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
      <AbsoluteFill
        style={{
          background: `repeating-linear-gradient(105deg, ${withAlpha(
            palette.text,
            0.014,
          )} 0px, ${withAlpha(palette.text, 0.014)} 1px, transparent 1px, transparent 9px)`,
        }}
      />

      <AbsoluteFill style={{ padding: pad, opacity: outro }}>
        <div
          style={{
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: portrait ? "column" : "row",
            gap: gap * 1.4,
          }}
        >
          {textColumn}
          {visualBlock}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: gap,
            paddingTop: gap * 0.8,
            borderTop: `1px solid ${palette.hairline}`,
            fontSize: 15 * unit,
            letterSpacing: 3 * unit,
            color: palette.muted,
          }}
        >
          <span>文字排版 · 留白</span>
          <span style={{ width: 10 * unit, height: 10 * unit, backgroundColor: accentColor }} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};