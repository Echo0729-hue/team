import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame } from "remotion";
import type { VideoProps } from "../params";
import { getActiveIndex, getTimeline } from "../timing";
import { analyzeLines } from "../illustrations/analyze";
import { SceneVisual } from "../illustrations/SceneVisual";
import { getVisualAnimation } from "../illustrations/visualAnimation";
import { CLAMP, FONT_SANS, linesOf, paletteFor, useLayout, withAlpha } from "./theme";

/**
 * 模板三：信息卡片
 * 每段文案一张卡片，横屏并排、竖屏堆叠；示意图放在卡片上方或右侧。
 */
export const CardsTemplate: React.FC<VideoProps> = ({
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

  const visualW = portrait ? Math.min(width * 0.5, 480) : Math.min(width * 0.24, 380);
  const visualH = visualW * 0.625;

  const outro = interpolate(frame, [tl.outroStart, tl.total - 1], [1, 0], CLAMP);
  const titleIn = spring({
    frame,
    fps,
    config: { damping: 24, stiffness: 90 },
    durationInFrames: Math.max(12, tl.intro),
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

  const cardsBlock = (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        minWidth: 0,
        display: "flex",
        flexDirection: portrait ? "column" : "row",
        gap: gap * 0.7,
      }}
    >
      {safeLines.map((line, index) => {
        const start = tl.lineStarts[index];
        const enter = spring({
          frame: frame - start,
          fps,
          config: { damping: 20, stiffness: 110, mass: 0.9 },
          durationInFrames: tl.enter + 10,
        });
        const opacity = interpolate(frame, [start, start + tl.enter], [0, 1], CLAMP);

        return (
          <div
            key={index}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              gap: gap * 0.4,
              padding: `${(portrait ? 22 : 16) * unit}px ${(portrait ? 22 : 16) * unit}px`,
              borderRadius: 16 * unit,
              border: `1px solid ${withAlpha(accentColor, 0.28)}`,
              background: `linear-gradient(160deg, ${withAlpha(palette.text, 0.07)} 0%, ${withAlpha(
                palette.text,
                0.02,
              )} 100%)`,
              opacity,
              transform: `translateY(${(1 - enter) * 50 * unit}px) scale(${0.96 + enter * 0.04})`,
              boxShadow: `0 ${14 * unit}px ${34 * unit}px ${withAlpha("#000000", 0.18)}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span
                style={{
                  fontSize: 14 * unit,
                  fontWeight: 700,
                  letterSpacing: 2 * unit,
                  color: accentColor,
                  padding: `${4 * unit}px ${9 * unit}px`,
                  borderRadius: 999,
                  border: `1px solid ${withAlpha(accentColor, 0.4)}`,
                  background: withAlpha(accentColor, 0.1),
                }}
              >
                {`0${index + 1}`}
              </span>
              <span style={{ width: 22 * unit, height: 2 * unit, backgroundColor: withAlpha(palette.text, 0.22) }} />
            </div>

            <div
              style={{
                marginTop: "auto",
                fontSize: (portrait ? 34 : 29) * unit,
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
  );

  return (
    <AbsoluteFill style={{ backgroundColor, fontFamily: FONT_SANS, overflow: "hidden" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 90% at 100% 0%, ${withAlpha(accentColor, 0.16)} 0%, ${withAlpha(
            accentColor,
            0,
          )} 60%)`,
        }}
      />

      <AbsoluteFill style={{ padding: pad, display: "flex", flexDirection: "column", opacity: outro }}>
        <div style={{ display: "flex", alignItems: "center", gap: gap * 0.5 }}>
          <div
            style={{
              width: 42 * unit,
              height: 6 * unit,
              borderRadius: 999,
              backgroundColor: accentColor,
              transform: `scaleX(${titleIn})`,
              transformOrigin: "left center",
            }}
          />
          <div style={{ fontSize: 15 * unit, letterSpacing: 4 * unit, color: palette.muted }}>
            CARDS / 03
          </div>
        </div>

        <div
          style={{
            marginTop: gap * 0.9,
            fontSize: (portrait ? 66 : 56) * unit,
            fontWeight: 800,
            lineHeight: 1.18,
            letterSpacing: unit,
            color: palette.text,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            opacity: titleIn,
            transform: `translateY(${(1 - titleIn) * 26 * unit}px)`,
            maxWidth: portrait ? undefined : "72%",
          }}
        >
          {title}
        </div>

        <div
          style={{
            marginTop: gap * 1.2,
            flex: 1,
            minHeight: 0,
            display: "flex",
            flexDirection: portrait ? "column" : "row",
            gap: gap * 0.9,
          }}
        >
          {portrait ? visualBlock : null}
          {cardsBlock}
          {portrait ? null : visualBlock}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};