/**
 * 字幕：类型、断句换行、SRT 输出。
 * 预览（Player）与服务端导出共用同一份 cues，字幕时间轴都来自真实配音每句时长。
 */

export type SubtitlePosition = "bottom" | "lower";

export type SubtitleStyle = {
  enabled: boolean;
  /** 字号倍率，1 = 默认（按画布短边推导） */
  fontScale: number;
  color: string;
  /** 半透明底色不透明度 0~0.9 */
  backgroundOpacity: number;
  position: SubtitlePosition;
};

export type SubtitleCue = {
  text: string;
  lines: string[];
  startFrame: number;
  endFrame: number;
};

export type SubtitleProps = SubtitleStyle & {
  cues: SubtitleCue[];
};

export const SUBTITLE_LIMITS = {
  fontScaleMin: 0.8,
  fontScaleMax: 1.5,
  backgroundOpacityMin: 0,
  backgroundOpacityMax: 0.9,
  maxCues: 120,
  maxCueChars: 120,
  /** 每屏最多两行 */
  maxLinesPerCue: 2,
  /** 每行最多 18 个全角字符 */
  lineMaxChars: 18,
} as const;

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  enabled: true,
  fontScale: 1,
  color: "#FFFFFF",
  backgroundOpacity: 0.45,
  position: "bottom",
};

export const DEFAULT_SUBTITLE_PROPS: SubtitleProps = {
  ...DEFAULT_SUBTITLE_STYLE,
  cues: [],
};

const BREAK_CHARS = "，,、；;：:！!？?。.";

/**
 * 把一句话拆成最多两行：
 * 1. 单行放得下就一行；
 * 2. 否则优先在标点处断开（尽量靠近中间），没有标点就按字符数均分。
 */
export const wrapSubtitleText = (
  text: string,
  maxChars: number = SUBTITLE_LIMITS.lineMaxChars,
): string[] => {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length === 0) {
    return [];
  }
  if (Array.from(clean).length <= maxChars) {
    return [clean];
  }

  const chars = Array.from(clean);
  const middle = Math.min(maxChars, chars.length / 2);
  let breakAt = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (let index = 1; index < chars.length - 1; index += 1) {
    if (!BREAK_CHARS.includes(chars[index]) || index + 1 > maxChars || (chars.length <= maxChars * 2 && chars.length - index - 1 > maxChars)) {
      continue;
    }
    const distance = Math.abs(index - middle);
    if (distance < bestDistance) {
      bestDistance = distance;
      breakAt = index + 1;
    }
  }

  if (breakAt <= 0) {
    breakAt = Math.min(maxChars, Math.ceil(chars.length / 2));
  }

  const first = chars.slice(0, breakAt).join("").trim();
  const second = chars.slice(breakAt).join("").trim();

  if (second.length === 0) {
    return [first];
  }
  if (Array.from(second).length <= maxChars) {
    return [first, second];
  }

  // 仍然太长时，第二行再截断一次，避免溢出安全区
  return [first, `${Array.from(second).slice(0, maxChars - 1).join("")}…`];
};

const pad = (value: number, length = 2): string => String(value).padStart(length, "0");

const toSrtTime = (seconds: number): string => {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)},${pad(ms, 3)}`;
};

/** 生成标准 SRT（时间轴与视频里的字幕完全一致） */
export const cuesToSrt = (cues: readonly SubtitleCue[], fps: number): string =>
  cues
    .map((cue, index) => {
      const start = toSrtTime(cue.startFrame / fps);
      const end = toSrtTime(cue.endFrame / fps);
      const body = (cue.lines.length > 0 ? cue.lines : [cue.text]).join("\n");
      return `${index + 1}\n${start} --> ${end}\n${body}\n`;
    })
    .join("\n");

/** 校验/清洗来自前端的字幕参数 */
export const sanitizeSubtitleStyle = (raw: unknown): SubtitleStyle => {
  const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

  const fontScale =
    typeof source.fontScale === "number" && Number.isFinite(source.fontScale)
      ? clamp(source.fontScale, SUBTITLE_LIMITS.fontScaleMin, SUBTITLE_LIMITS.fontScaleMax)
      : DEFAULT_SUBTITLE_STYLE.fontScale;

  const backgroundOpacity =
    typeof source.backgroundOpacity === "number" && Number.isFinite(source.backgroundOpacity)
      ? clamp(source.backgroundOpacity, SUBTITLE_LIMITS.backgroundOpacityMin, SUBTITLE_LIMITS.backgroundOpacityMax)
      : DEFAULT_SUBTITLE_STYLE.backgroundOpacity;

  const color =
    typeof source.color === "string" && /^#[0-9a-fA-F]{6}$/.test(source.color.trim())
      ? source.color.trim().toUpperCase()
      : DEFAULT_SUBTITLE_STYLE.color;

  const position: SubtitlePosition = source.position === "lower" ? "lower" : "bottom";

  return {
    enabled: source.enabled !== false,
    fontScale,
    color,
    backgroundOpacity,
    position,
  };
};

export const sanitizeCues = (raw: unknown, fps: number, totalFrames: number): SubtitleCue[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const cues: SubtitleCue[] = [];
  for (const entry of raw.slice(0, SUBTITLE_LIMITS.maxCues)) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const item = entry as Record<string, unknown>;
    const text =
      typeof item.text === "string" ? Array.from(item.text.replace(/\s+/g, " ").trim()).slice(0, SUBTITLE_LIMITS.maxCueChars).join("") : "";
    const startFrame = typeof item.startFrame === "number" && Number.isFinite(item.startFrame) ? Math.max(0, item.startFrame) : null;
    const endFrame = typeof item.endFrame === "number" && Number.isFinite(item.endFrame) ? Math.min(totalFrames, item.endFrame) : null;

    if (text.length === 0 || startFrame === null || endFrame === null || endFrame <= startFrame) {
      continue;
    }

    const lines = Array.isArray(item.lines)
      ? item.lines
          .slice(0, SUBTITLE_LIMITS.maxLinesPerCue)
          .filter((line): line is string => typeof line === "string" && line.trim().length > 0)
      : [];
    const wrapped = lines.length > 0 && lines.every((line) => Array.from(line).length <= SUBTITLE_LIMITS.lineMaxChars)
      ? lines : wrapSubtitleText(text);

    cues.push({
      text,
      lines: wrapped.slice(0, SUBTITLE_LIMITS.maxLinesPerCue),
      startFrame: Math.round(startFrame),
      endFrame: Math.round(endFrame),
    });
  }

  // 保证时间轴单调递增，避免出现重叠字幕
  cues.sort((a, b) => a.startFrame - b.startFrame);
  const clean: SubtitleCue[] = [];
  for (const cue of cues) {
    cue.startFrame = Math.max(cue.startFrame, clean.at(-1)?.endFrame ?? 0);
    if (cue.endFrame > cue.startFrame) clean.push(cue);
  }
  return clean;
};
