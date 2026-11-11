import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from "remotion";
import type { VideoProps } from "../params";
import { getActiveIndex, getTimeline } from "../timing";
import { analyzeLines } from "../illustrations/analyze";
import { SceneVisual } from "../illustrations/SceneVisual";
import { getVisualAnimation } from "../illustrations/visualAnimation";
import { CLAMP, FONT_SANS, linesOf, paletteFor, useLayout, withAlpha } from "./theme";

/**
 * 模板一：科技光效
 * 光斑 + 旋转圆环；每段文案配一张同主题的 SVG 示意图，随段落入场/强调/退场。
 */
export const TechTemplate: React.FC<VideoProps> = ({
  title,
  lines,
  backgroundColor,
  accentColor,
}) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames, unit, pad, gap, width, height, short, portrait } = useLayout();
  const palette = paletteFor(backgroundColor);
  const safeLines = linesOf(lines);
  const tl = getTimeline(durationInFrames);

  const specs = analyzeLines({ title, lines: safeLines });
  const active = getActiveIndex(frame, tl);
  const visual = getVisualAnimation(frame, tl, active);

  const visualW = portrait ? Math.min(width * 0.46, 480) : Math.min(width * 0.26, 460);
  const visualH = visualW * 0.625;

  const titleIn = interpolate(frame, [0, Math.max(8, Math.round(tl.intro * 0.45))], [0, 1], CLAMP);
  const titleRise = spring({
    frame,
    fps,
    config: { damping: 22, stiffness: 110, mass: 0.9 },
    durationInFrames: Math.max(12, tl.intro),
  });
  const underline = spring({
    frame: frame - Math.round(tl.intro * 0.25),
    fps,
    config: { damping: 26, stiffness: 90 },
  });
  const outro = interpolate(frame, [tl.outroStart, tl.total - 1], [1, 0], CLAMP);
  const progress = interpolate(frame, [0, tl.total - 1], [0, 1], CLAMP);

  const glowX = interpolate(frame, [0, tl.total], [46, 54], CLAMP);
  const glowY = interpolate(frame, [0, tl.total], [24, 32], CLAMP);
  const ringRotate = interpolate(frame, [0, tl.total], [-18, 22], CLAMP);

  const titleBlock = (
    <div style={{ display: "flex", gap: gap * 0.9, alignItems: "stretch" }}>
      <div
        style={{
          width: Math.max(6, 14 * unit),
          borderRadius: 999,
          backgroundColor: accentColor,
          transform: `scaleY(${Math.max(underline, 0.001)})`,
          transformOrigin: "top center",
          boxShadow: `0 0 ${42 * unit}px ${withAlpha(accentColor, 0.65)}`,
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 34 * unit,
            fontWeight: 600,
            letterSpacing: 10 * unit,
            color: accentColor,
            opacity: interpolate(frame, [tl.intro * 0.3, tl.intro * 0.9], [0, 1], CLAMP),
            marginBottom: 18 * unit,
          }}
        >
          {(durationInFrames / fps).toFixed(0)} SECONDS
        </div>
        <div
          style={{
            fontSize: (portrait ? 82 : 74) * unit,
            lineHeight: 1.2,
            fontWeight: 800,
            letterSpacing: 2 * unit,
            color: palette.text,
            opacity: titleIn,
            transform: `translateY(${(1 - titleRise) * 64 * unit}px)`,
            filter: `blur(${(1 - titleRise) * 10 * unit}px)`,
            textShadow: palette.isLight ? "none" : "0 12px 48px rgba(0, 0, 0, 0.38)",
            wordBreak: "break-word",
            whiteSpace: "pre-wrap",
          }}
        >
          {title}
        </div>
        <div
          style={{
            marginTop: 26 * unit,
            height: Math.max(4, 8 * unit),
            width: Math.min(short * 0.4, 420 * unit),
            borderRadius: 999,
            backgroundColor: withAlpha(accentColor, 0.28),
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: "42%",
              borderRadius: 999,
              backgroundColor: accentColor,
              transform: `scaleX(${Math.max(underline, 0.001)})`,
              transformOrigin: "left center",
            }}
          />
        </div>
      </div>
    </div>
  );

  const visualBlock = (
    <div
      style={{
        width: visualW,
        height: visualH,
        flex: "0 0 auto",
        alignSelf: portrait ? "center" : "center",
        marginTop: portrait ? gap * 1.4 : 0,
        marginBottom: portrait ? gap * 1.4 : 0,
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

  const linesBlock = (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: (portrait ? 44 : 34) * unit,
        marginTop: portrait ? 0 : gap * 1.6,
        maxWidth: portrait ? undefined : width * 0.62,
      }}
    >
      {safeLines.map((line, index) => {
        const start = tl.lineStarts[index];
        const rise = spring({
          frame: frame - start,
          fps,
          config: { damping: 24, stiffness: 96, mass: 1 },
          durationInFrames: tl.enter + 12,
        });
        const opacity = interpolate(frame, [start, start + tl.enter], [0, 1], CLAMP);
        const wipe = interpolate(frame, [start, start + tl.enter + 6], [0, 1], CLAMP);

        return (
          <div
            key={index}
            style={{
              display: "flex",
              gap: gap,
              alignItems: "flex-start",
              opacity,
              transform: `translateY(${(1 - rise) * 52 * unit}px)`,
            }}
          >
            <div
              style={{
                minWidth: 76 * unit,
                paddingTop: 6 * unit,
                fontSize: 28 * unit,
                fontWeight: 700,
                letterSpacing: 2 * unit,
                color: accentColor,
                opacity: 0.9,
              }}
            >
              {`0${index + 1}`}
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 40 * unit,
                lineHeight: 1.58,
                fontWeight: 500,
                letterSpacing: unit,
                color: palette.secondary,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                clipPath: `inset(0 ${(1 - wipe) * 100}% 0 0)`,
              }}
            >
              {line}
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <AbsoluteFill style={{ backgroundColor, fontFamily: FONT_SANS, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at ${glowX}% ${glowY}%, ${withAlpha(
            accentColor,
            palette.isLight ? 0.3 : 0.42,
          )} 0%, ${withAlpha(accentColor, 0)} 62%)`,
        }}
      />

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
        <div
          style={{
            width: short * 1.45,
            height: short * 1.45,
            borderRadius: "50%",
            border: `2px solid ${withAlpha(accentColor, palette.isLight ? 0.22 : 0.3)}`,
            transform: `translate(${width * 0.34}px, ${-height * 0.4}px) rotate(${ringRotate}deg)`,
          }}
        />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          padding: `0 ${pad}px`,
          display: "flex",
          flexDirection: portrait ? "column" : "row",
          alignItems: portrait ? "stretch" : "center",
          justifyContent: "center",
          gap: gap * 1.4,
          opacity: outro,
        }}
      >
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center" }}>
          {titleBlock}
          {portrait ? visualBlock : null}
          {linesBlock}
        </div>

        {portrait ? null : visualBlock}
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: "flex-end", opacity: outro }}>
        <div style={{ height: Math.max(4, 10 * unit), backgroundColor: withAlpha(palette.text, 0.1) }}>
          <div
            style={{
              height: "100%",
              width: `${progress * 100}%`,
              backgroundColor: accentColor,
              boxShadow: `0 0 28px ${withAlpha(accentColor, 0.7)}`,
            }}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
