import { useVideoConfig } from "remotion";

export const FONT_SANS =
  '"PingFang SC", "Microsoft YaHei", "Noto Sans SC", "Source Han Sans SC", "Hiragino Sans GB", system-ui, sans-serif';

export const FONT_SERIF =
  '"Songti SC", "STSong", "SimSun", "Noto Serif SC", "Source Han Serif SC", "Times New Roman", serif';

export const CLAMP = {
  extrapolateLeft: "clamp",
  extrapolateRight: "clamp",
} as const;

export const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  const value = hex.replace("#", "");
  const normalized =
    value.length === 3
      ? value
          .split("")
          .map((char) => char + char)
          .join("")
      : value.padEnd(6, "0").slice(0, 6);

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16) || 0,
    g: Number.parseInt(normalized.slice(2, 4), 16) || 0,
    b: Number.parseInt(normalized.slice(4, 6), 16) || 0,
  };
};

export const withAlpha = (hex: string, alpha: number): string => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

export const relativeLuminance = (hex: string): number => {
  const { r, g, b } = hexToRgb(hex);
  const channel = (value: number) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : Math.pow((normalized + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

export type Palette = {
  isLight: boolean;
  text: string;
  secondary: string;
  muted: string;
  hairline: string;
  surface: string;
};

/** 根据背景亮度生成一套文字/线条颜色，浅色背景也能看清 */
export const paletteFor = (backgroundColor: string): Palette => {
  const isLight = relativeLuminance(backgroundColor) > 0.55;
  const text = isLight ? "#0B1120" : "#FFFFFF";
  return {
    isLight,
    text,
    secondary: withAlpha(text, 0.72),
    muted: withAlpha(text, 0.5),
    hairline: withAlpha(text, 0.16),
    surface: withAlpha(text, 0.06),
  };
};

/**
 * 以画布短边为基准推导字号与留白，保证同一个模板在
 * 9:16 / 16:9 / 1:1 / 4:5 / 4:3 下都不会溢出或显得空旷。
 */
export const useLayout = () => {
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const short = Math.min(width, height);
  const long = Math.max(width, height);
  const portrait = height >= width;
  const unit = short / 1080;

  return {
    width,
    height,
    short,
    long,
    portrait,
    fps,
    durationInFrames,
    unit,
    pad: Math.round(short * 0.088),
    gap: Math.round(short * 0.028),
  };
};

export type Layout = ReturnType<typeof useLayout>;

/** 三段文案的安全读取 */
export const linesOf = (lines: string[]): [string, string, string] => [
  lines[0] ?? "",
  lines[1] ?? "",
  lines[2] ?? "",
];