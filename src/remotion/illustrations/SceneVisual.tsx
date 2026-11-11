import React from "react";
import type { Palette } from "../templates/theme";
import { withAlpha } from "../templates/theme";
import type { VisualSpec } from "./analyze";

type SceneVisualProps = {
  spec: VisualSpec;
  accentColor: string;
  palette: Palette;
  width: number;
  height: number;
  /** 入场进度 0~1 */
  enter: number;
  /** 退场进度 0~1 */
  exit: number;
  /** 强调脉冲 0~1 */
  pulse: number;
};

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const stepProgress = (enter: number, index: number, total: number): number => {
  const start = index * 0.8 / Math.max(1, total);
  return clamp01((enter - start) / 0.55);
};

const shortLabel = (label: string, max = 6): string => {
  const chars = Array.from(label);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : label;
};

/**
 * 文案图案：纯 SVG 矢量绘制，跟随所在段落的入场/强调/退场动画。
 * 五种图形共用同一套线宽、圆角与配色，保证整支视频风格一致。
 */
export const SceneVisual: React.FC<SceneVisualProps> = ({
  spec,
  accentColor,
  palette,
  width,
  height,
  enter,
  exit,
  pulse,
}) => {
  const progress = clamp01(enter) * (1 - clamp01(exit));
  const opacity = progress;
  const scale = 1 + clamp01(pulse) * 0.018;

  const stroke = withAlpha(palette.text, 0.22);
  const label = palette.secondary;

  const nodeFill = withAlpha(accentColor, 0.12);
  const nodeStroke = withAlpha(accentColor, 0.75);

  const renderFlow = () => {
    const nodes = [58, 160, 262];
    const labels = spec.labels.length > 0 ? spec.labels : ["", "", ""];

    return (
      <svg viewBox="0 0 320 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        {nodes.slice(0, -1).map((x, index) => {
          const p = stepProgress(enter, index + 0.5, 3);
          return (
            <g key={`arrow-${index}`} opacity={p}>
              <line
                x1={x + 30}
                y1={96}
                x2={nodes[index + 1] - 30 - (1 - p) * 12}
                y2={96}
                stroke={nodeStroke}
                strokeWidth={2}
                strokeLinecap="round"
              />
              <path
                d={`M${nodes[index + 1] - 34} 91 l6 5 -6 5`}
                fill="none"
                stroke={nodeStroke}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          );
        })}

        {nodes.map((x, index) => {
          const p = stepProgress(enter, index, 3);
          return (
            <g key={`node-${index}`} opacity={p} transform={`translate(${x} 96) scale(${0.9 + p * 0.1})`}>
              <rect
                x={-30}
                y={-26}
                width={60}
                height={52}
                rx={10}
                fill={nodeFill}
                stroke={nodeStroke}
                strokeWidth={1.6}
              />
              <circle cx={0} cy={-6} r={7} fill="none" stroke={nodeStroke} strokeWidth={1.6} />
              <line x1={-13} y1={10} x2={13} y2={10} stroke={nodeStroke} strokeWidth={1.6} strokeLinecap="round" />
              {labels[index] ? (
                <text
                  x={0}
                  y={46}
                  textAnchor="middle"
                  fontSize={11}
                  fill={label}
                  fontFamily="inherit"
                >
                  {shortLabel(labels[index], 5)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    );
  };

  const renderCompare = () => {
    const left = spec.labels[0] ?? "";
    const right = spec.labels[1] ?? "";
    const p = clamp01(enter / 0.6);

    return (
      <svg viewBox="0 0 320 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <g opacity={p}>
          <rect x={18} y={44} width={124} height={118} rx={12} fill={withAlpha(palette.text, 0.04)} stroke={stroke} strokeWidth={1.6} />
          <rect x={178} y={44} width={124} height={118} rx={12} fill={withAlpha(accentColor, 0.12)} stroke={nodeStroke} strokeWidth={1.6} />
          {[0, 1, 2].map((i) => (
            <line
              key={`l-${i}`}
              x1={34}
              y1={106 + i * 16}
              x2={124 - i * 12}
              y2={106 + i * 16}
              stroke={withAlpha(palette.text, 0.3)}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
          {[0, 1, 2].map((i) => (
            <line
              key={`r-${i}`}
              x1={194}
              y1={106 + i * 16}
              x2={286 - i * 10}
              y2={106 + i * 16}
              stroke={nodeStroke}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
          {left ? (
            <text x={80} y={76} textAnchor="middle" fontSize={11} fill={label} fontFamily="inherit">
              {shortLabel(left, 5)}
            </text>
          ) : null}
          {right ? (
            <text x={240} y={76} textAnchor="middle" fontSize={11} fill={label} fontFamily="inherit">
              {shortLabel(right, 5)}
            </text>
          ) : null}
          <circle cx={160} cy={103} r={17} fill="none" stroke={withAlpha(accentColor, 0.6)} strokeWidth={1.6} />
          <text x={160} y={107} textAnchor="middle" fontSize={11} fill={withAlpha(accentColor, 0.95)} fontFamily="inherit">
            VS
          </text>
        </g>
      </svg>
    );
  };

  const renderGrowth = () => {
    const numbers = spec.numbers;
    const axisY = 158;
    const plot = { left: 46, right: 288, top: 40, bottom: axisY };

    if (numbers.length >= 2) {
      const values = numbers.map((item) => item.value);
      const min = Math.min(...values);
      const max = Math.max(...values);
      const span = max - min || 1;
      const points = numbers.map((item, index) => {
        const x = plot.left + (index / Math.max(1, numbers.length - 1)) * (plot.right - plot.left);
        const y = plot.bottom - ((item.value - min) / span) * (plot.bottom - plot.top - 12) - 6;
        return { x, y, item };
      });

      const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
      const draw = clamp01(enter / 0.7);

      return (
        <svg viewBox="0 0 320 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          <line x1={plot.left} y1={plot.top} x2={plot.left} y2={plot.bottom} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
          <line x1={plot.left} y1={plot.bottom} x2={plot.right} y2={plot.bottom} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
          <path
            d={path}
            fill="none"
            stroke={accentColor}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - draw}
          />
          {points.map((point, index) => {
            const p = stepProgress(enter, index, points.length);
            return (
              <g key={`pt-${index}`} opacity={p}>
                <circle cx={point.x} cy={point.y} r={4.5} fill={palette.isLight ? "#fff" : "#0b1120"} stroke={accentColor} strokeWidth={2} />
                <text x={point.x} y={point.y - 13} textAnchor="middle" fontSize={11} fill={label} fontFamily="inherit">
                  {`${point.item.value}${point.item.unit}`}
                </text>
              </g>
            );
          })}
        </svg>
      );
    }

    if (numbers.length === 1) {
      const item = numbers[0];
      const p = clamp01(enter / 0.55);
      return (
        <svg viewBox="0 0 320 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          <g opacity={p}>
            <path d="M52 150 C 120 148, 170 120, 214 88" fill="none" stroke={withAlpha(accentColor, 0.45)} strokeWidth={2.4} strokeLinecap="round" />
            <path d="M204 84 l14 2 -6 13" fill="none" stroke={withAlpha(accentColor, 0.8)} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
            <text x={60} y={112} fontSize={40} fontWeight={700} fill={accentColor} fontFamily="inherit">
              {`${item.value}${item.unit}`}
            </text>
            
          </g>
        </svg>
      );
    }

    const curve = "M50 150 C 100 150, 130 118, 168 104 S 232 66, 280 56";
    const draw = clamp01(enter / 0.7);
    return (
      <svg viewBox="0 0 320 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <line x1={46} y1={40} x2={46} y2={158} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
        <line x1={46} y1={158} x2={288} y2={158} stroke={stroke} strokeWidth={1.6} strokeLinecap="round" />
        <path
          d={curve}
          fill="none"
          stroke={accentColor}
          strokeWidth={2.4}
          strokeLinecap="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - draw}
        />
        <path d="M270 50 l16 5 -8 14" fill="none" stroke={withAlpha(accentColor, 0.85)} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" opacity={draw} />
      </svg>
    );
  };

  const renderProduct = () => {
    const labels = spec.labels.slice(0, 3);
    const callouts = [
      { x: 74, y: 78, dir: -1 },
      { x: 246, y: 104, dir: 1 },
      { x: 160, y: 46, dir: 0 },
    ];

    return (
      <svg viewBox="0 0 320 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <g opacity={clamp01(enter / 0.55)}>
          <rect x={78} y={54} width={164} height={102} rx={14} fill={withAlpha(palette.text, 0.04)} stroke={stroke} strokeWidth={1.8} />
          <rect x={96} y={72} width={128} height={12} rx={6} fill={withAlpha(accentColor, 0.5)} />
          <rect x={96} y={94} width={92} height={8} rx={4} fill={withAlpha(palette.text, 0.2)} />
          <rect x={96} y={110} width={110} height={8} rx={4} fill={withAlpha(palette.text, 0.16)} />
          <rect x={96} y={126} width={70} height={8} rx={4} fill={withAlpha(accentColor, 0.35)} />

          {callouts.map((point, index) => {
            const text = labels[index];
            if (!text) {
              return null;
            }
            const p = stepProgress(enter, index, 3);
            const textX = point.dir === 0 ? point.x : point.dir < 0 ? 20 : 226;
            const textY = point.dir === 0 ? 26 : point.y;
            const anchor = point.dir === 0 ? "middle" : point.dir < 0 ? "start" : "end";

            return (
              <g key={`callout-${index}`} opacity={p}>
                <line
                  x1={point.x}
                  y1={point.y}
                  x2={point.dir === 0 ? point.x : point.dir < 0 ? 56 : 268}
                  y2={point.dir === 0 ? 36 : point.y}
                  stroke={withAlpha(accentColor, 0.55)}
                  strokeWidth={1.4}
                />
                <circle cx={point.x} cy={point.y} r={4} fill={accentColor} />
                <text x={textX} y={textY} textAnchor={anchor} fontSize={10.5} fill={label} fontFamily="inherit">
                  {shortLabel(text, 6)}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    );
  };

  const renderText = () => (
    <svg viewBox="0 0 320 200" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
      <g opacity={clamp01(enter / 0.55)}>
        <rect x={44} y={52} width={6} height={96} rx={3} fill={accentColor} opacity={0.75} />
        {[0, 1, 2, 3].map((i) => {
          const p = stepProgress(enter, i, 4);
          const highlight = i === 1;
          return (
            <rect
              key={`line-${i}`}
              x={64}
              y={62 + i * 22}
              width={highlight ? 176 : 148 - i * 14}
              height={highlight ? 8 : 6}
              rx={4}
              fill={highlight ? withAlpha(accentColor, 0.7) : withAlpha(palette.text, 0.22)}
              opacity={p}
            />
          );
        })}
      </g>
    </svg>
  );

  const body =
    spec.kind === "flow"
      ? renderFlow()
      : spec.kind === "compare"
        ? renderCompare()
        : spec.kind === "growth"
          ? renderGrowth()
          : spec.kind === "product"
            ? renderProduct()
            : renderText();

  return (
    <div
      className="scene-visual"
      style={{
        width,
        height,
        opacity,
        transform: `translateY(${(1 - clamp01(enter)) * height * 0.08}px) scale(${scale})`,
        color: palette.text,
      }}
      aria-hidden="true"
    >
      {body}
    </div>
  );
};