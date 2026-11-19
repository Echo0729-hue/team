/**
 * 预览（@remotion/player）与服务端导出（@remotion/renderer）共用的参数定义。
 * 模板、比例、时长、尺寸都从这里派生，网页预览与最终 MP4 使用同一份配置。
 */

export const VIDEO_CONFIG = {
  compositionId: "TextPromo",
  fps: 30,
} as const;

/** 时长范围（秒） */
export const DURATION_LIMITS = {
  min: 5,
  max: 15,
  default: 15,
  step: 1,
} as const;

export const DEFAULT_DURATION_SECONDS = DURATION_LIMITS.default;

/** 兼容旧引用：默认时长 */
export const VIDEO_DURATION_IN_SECONDS = DEFAULT_DURATION_SECONDS;
export const VIDEO_DURATION_SECONDS = DEFAULT_DURATION_SECONDS;

import {
  buildScriptFromLines,
  resolveDurationFromAudio,
  sanitizeNarration,
  type DurationMode,
  type NarrationProps,
} from "./narration";
import {
  sanitizeCues,
  sanitizeSubtitleStyle,
  type SubtitleProps,
} from "./subtitles";
import { sanitizeLayers, type Layer } from "./layers";
import { sanitizeEffects, type VideoEffect } from "./effects";

/* ------------------------------ 画面比例 ------------------------------ */

export type RatioId = "9:16" | "16:9" | "1:1" | "4:5" | "4:3";

export type VideoRatio = {
  id: RatioId;
  name: string;
  width: number;
  height: number;
};

export const VIDEO_RATIOS: readonly VideoRatio[] = [
  { id: "9:16", name: "竖屏", width: 1080, height: 1920 },
  { id: "16:9", name: "横屏", width: 1920, height: 1080 },
  { id: "1:1", name: "方形", width: 1080, height: 1080 },
  { id: "4:5", name: "竖版", width: 1080, height: 1350 },
  { id: "4:3", name: "横版", width: 1440, height: 1080 },
] as const;

export const DEFAULT_RATIO: RatioId = "9:16";

export const RATIO_MAP: Record<RatioId, VideoRatio> = Object.fromEntries(
  VIDEO_RATIOS.map((ratio) => [ratio.id, ratio]),
) as Record<RatioId, VideoRatio>;

export const isRatioId = (value: unknown): value is RatioId =>
  typeof value === "string" && Object.hasOwn(RATIO_MAP, value);

/* ------------------------------ 画面模板 ------------------------------ */

export type TemplateId = "tech" | "editorial" | "cards" | "split" | "quote" | "kinetic";

export type VideoTemplateMeta = {
  id: TemplateId;
  name: string;
  description: string;
};

export const VIDEO_TEMPLATES: readonly VideoTemplateMeta[] = [
  { id: "tech", name: "科技光效", description: "光斑圆环，文字依次浮现" },
  { id: "editorial", name: "极简杂志", description: "大标题、留白与细线排版" },
  { id: "cards", name: "信息卡片", description: "三段文案依次落入卡片" },
  { id: "split", name: "分栏展示", description: "标题与内容分区，横竖自适应" },
  { id: "quote", name: "金句海报", description: "突出标题与引号，文案轮播" },
  { id: "kinetic", name: "动感文字", description: "放大滑入与几何色块" },
] as const;

export const DEFAULT_TEMPLATE: TemplateId = "tech";

export const TEMPLATE_MAP: Record<TemplateId, VideoTemplateMeta> = Object.fromEntries(
  VIDEO_TEMPLATES.map((template) => [template.id, template]),
) as Record<TemplateId, VideoTemplateMeta>;

export const isTemplateId = (value: unknown): value is TemplateId =>
  typeof value === "string" && Object.hasOwn(TEMPLATE_MAP, value);

/* ------------------------------ 视频参数 ------------------------------ */

export type VideoProps = {
  manimAssets?: Record<string, import("./manim").ManimAsset>;
  title: string;
  lines: string[];
  backgroundColor: string;
  accentColor: string;
  template: TemplateId;
  ratio: RatioId;
  /** 视频时长（秒），5~15，默认 15 */
  durationInSeconds: number;
  /** 时长模式：固定 / 跟随配音 */
  durationMode: DurationMode;
  /** 配音（音色、语速、音频地址与真实时长） */
  narration: NarrationProps;
  /** 字幕（开关、样式、与服务端一致的时间轴） */
  subtitles: SubtitleProps;
  /** 画面图层（图片 / 文字），编辑画布与导出共用 */
  layers: Layer[];
  /** Optional for old projects and integrations. Always sanitized before export. */
  effects?: VideoEffect[];
};

export const DEFAULT_VIDEO_PROPS: VideoProps = {
  title: "代码生成视频",
  lines: [
    "三步完成：写下标题、选择模板、一键导出。",
    "对比传统剪辑，它把渲染交给服务端自动完成。",
    "导出后数据持续增长，点击率提升 120%。",
  ],
  backgroundColor: "#0B1120",
  accentColor: "#38BDF8",
  template: "tech",
  ratio: "9:16",
  durationInSeconds: DEFAULT_DURATION_SECONDS,
  durationMode: "fixed",
  narration: {
    enabled: false,
    ttsId: null,
    audioSrc: null,
    script: "",
    voiceId: null,
    voiceName: null,
    provider: null,
    speed: 1,
    volume: 0.9,
    audioDurationSeconds: 0,
  },
  subtitles: {
    enabled: false,
    fontScale: 1,
    color: "#FFFFFF",
    backgroundOpacity: 0.45,
    position: "bottom",
    cues: [],
  },
  layers: [],
  effects: [],
};

/** 由比例推导真实画布尺寸（Composition、Player、导出共用） */
export const getVideoSize = (
  props: Pick<VideoProps, "ratio">,
): { width: number; height: number } => {
  const ratio = RATIO_MAP[props.ratio] ?? RATIO_MAP[DEFAULT_RATIO];
  return { width: ratio.width, height: ratio.height };
};

const clampDuration = (value: number): number =>
  Math.min(DURATION_LIMITS.max, Math.max(DURATION_LIMITS.min, value));

/** 由时长推导总帧数（30fps） */
export const getDurationInFrames = (
  props: Pick<VideoProps, "durationInSeconds">,
): number => Math.round(clampDuration(props.durationInSeconds) * VIDEO_CONFIG.fps);

export const INPUT_LIMITS = {
  titleMaxLength: 20,
  lineMaxLength: 44,
  lineCount: 3,
} as const;

export type VideoFieldErrors = Partial<
  Record<
    | "title"
    | "line0"
    | "line1"
    | "line2"
    | "backgroundColor"
    | "accentColor"
    | "template"
    | "ratio"
    | "duration"
    | "narration"
    | "subtitle",
    string
  >
>;

export type ValidationSuccess = {
  ok: true;
  value: VideoProps;
};

export type ValidationFailure = {
  ok: false;
  errors: VideoFieldErrors;
};

export type ValidationResult = ValidationSuccess | ValidationFailure;

const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

/** 统计字符数量（按可见字符计，兼容中文与 emoji） */
export const countCharacters = (input: string): number => Array.from(input).length;

const normalizeColor = (input: string): string => {
  const value = input.trim();
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    const [r, g, b] = [value[1], value[2], value[3]];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  return value.toUpperCase();
};

const readString = (source: Record<string, unknown>, key: string): string =>
  typeof source[key] === "string" ? (source[key] as string) : "";

/**
 * 校验用户提交的内容。
 * - 标题 1~20 字，三段文案各 1~44 字，颜色 #RGB / #RRGGBB
 * - template / ratio 可省略（旧请求兼容）；duration 可省略（默认 15 秒）
 */
export const validateVideoInput = (raw: unknown): ValidationResult => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: { title: "请求内容格式不正确，请刷新页面后重试。" } };
  }

  const source = raw as Record<string, unknown>;
  const errors: VideoFieldErrors = {};

  const rawTitle = readString(source, "title");
  const title = rawTitle.trim().replace(/\r\n/g, "\n");

  if (title.length === 0) {
    errors.title = "标题不能为空。";
  } else if (countCharacters(title) > INPUT_LIMITS.titleMaxLength) {
    errors.title = `标题最多 ${INPUT_LIMITS.titleMaxLength} 个字，当前 ${countCharacters(title)} 个字。`;
  } else if (title.includes("\n")) {
    errors.title = "标题不能换行。";
  }

  const rawLines = Array.isArray(source.lines) ? source.lines : [];
  const lines: string[] = [];

  for (let index = 0; index < INPUT_LIMITS.lineCount; index += 1) {
    const key = `line${index}` as "line0" | "line1" | "line2";
    const rawLine = typeof rawLines[index] === "string" ? (rawLines[index] as string) : "";
    const line = rawLine.trim();

    if (line.length === 0) {
      errors[key] = `第 ${index + 1} 段文案不能为空。`;
    } else if (countCharacters(line) > INPUT_LIMITS.lineMaxLength) {
      errors[key] = `第 ${index + 1} 段文案最多 ${INPUT_LIMITS.lineMaxLength} 个字，当前 ${countCharacters(line)} 个字。`;
    }

    lines.push(line);
  }

  const readColor = (key: "backgroundColor" | "accentColor", label: string): string => {
    const value = readString(source, key).trim();
    if (value.length === 0) {
      errors[key] = `请填写${label}，格式为 #RRGGBB。`;
      return "";
    }
    if (!HEX_COLOR_PATTERN.test(value)) {
      errors[key] = `${label}格式不正确，请使用 #RRGGBB（例如 #0B1120）或 #RGB。`;
      return "";
    }
    return normalizeColor(value);
  };

  const backgroundColor = readColor("backgroundColor", "背景颜色");
  const accentColor = readColor("accentColor", "强调色");

  const rawTemplate = source.template;
  let template: TemplateId = DEFAULT_TEMPLATE;
  if (rawTemplate !== undefined && rawTemplate !== null && rawTemplate !== "") {
    if (!isTemplateId(rawTemplate)) {
      errors.template = "画面模板不支持，请重新选择。";
    } else {
      template = rawTemplate;
    }
  }

  const rawRatio = source.ratio;
  let ratio: RatioId = DEFAULT_RATIO;
  if (rawRatio !== undefined && rawRatio !== null && rawRatio !== "") {
    if (!isRatioId(rawRatio)) {
      errors.ratio = "画面比例不支持，请重新选择。";
    } else {
      ratio = rawRatio;
    }
  }

  let durationInSeconds: number = DEFAULT_DURATION_SECONDS;
  const rawDuration = source.durationInSeconds;
  if (rawDuration !== undefined && rawDuration !== null && rawDuration !== "") {
    const parsed = typeof rawDuration === "number" ? rawDuration : Number(rawDuration);
    if (!Number.isFinite(parsed)) {
      errors.duration = "视频时长必须是数字。";
    } else if (parsed < DURATION_LIMITS.min || parsed > DURATION_LIMITS.max) {
      errors.duration = `视频时长需在 ${DURATION_LIMITS.min} 到 ${DURATION_LIMITS.max} 秒之间。`;
    } else {
      durationInSeconds = Math.round(parsed * 2) / 2;
    }
  }

  // 配音与字幕（可选，旧请求不带这两个字段时保持原行为）
  const narration = sanitizeNarration(source.narration, VIDEO_CONFIG.fps, buildScriptFromLines(title, lines));
  const durationMode: DurationMode =
    source.durationMode === "voice" && narration.enabled ? "voice" : "fixed";

  if (narration.enabled) {
    if (!narration.ttsId || !narration.audioSrc || narration.audioDurationSeconds <= 0) {
      errors.narration = "已开启配音，但还没有生成配音音频，请先生成配音。";
    } else if (durationMode === "voice") {
      const resolved = resolveDurationFromAudio(narration.audioDurationSeconds);
      if (resolved === null) {
        errors.duration = `配音时长 ${narration.audioDurationSeconds.toFixed(1)} 秒超出单段 15 秒上限：请缩短讲稿、适当提高语速后重新生成，或拆成多个镜头。`;
      } else {
        durationInSeconds = resolved;
      }
    } else if (narration.audioDurationSeconds > durationInSeconds + 0.05) {
      errors.duration = `配音 ${narration.audioDurationSeconds.toFixed(1)} 秒比当前时长 ${durationInSeconds.toFixed(1)} 秒长：请延长时长、切换到「跟随配音时长」，或缩短讲稿。`;
    }
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const subtitleStyle = sanitizeSubtitleStyle(source.subtitles);
  const totalFrames = getDurationInFrames({ durationInSeconds });
  const cues = sanitizeCues(
    typeof source.subtitles === "object" && source.subtitles !== null
      ? (source.subtitles as Record<string, unknown>).cues
      : [],
    VIDEO_CONFIG.fps,
    totalFrames,
  );

  const subtitles: SubtitleProps = {
    ...subtitleStyle,
    enabled: subtitleStyle.enabled && cues.length > 0,
    cues,
  };

  if (subtitles.enabled && !narration.enabled) {
    // 没有配音时字幕也能独立使用，但没有时间轴就不显示
    subtitles.enabled = cues.length > 0;
  }

  const layers = sanitizeLayers(source.layers, totalFrames);
  const effects = sanitizeEffects(source.effects, totalFrames);

  return {
    ok: true,
    value: {
      title,
      lines,
      backgroundColor,
      accentColor,
      template,
      ratio,
      durationInSeconds,
      durationMode,
      narration,
      subtitles,
      layers,
      effects,
    },
  };
};

/** 前端表单状态的形状（三段文案拆成独立字段，便于逐项提示错误） */
export type VideoFormValues = {
  title: string;
  line0: string;
  line1: string;
  line2: string;
  backgroundColor: string;
  accentColor: string;
  template: TemplateId;
  ratio: RatioId;
  durationInSeconds: number;
};

export const toFormValues = (props: VideoProps): VideoFormValues => ({
  title: props.title,
  line0: props.lines[0] ?? "",
  line1: props.lines[1] ?? "",
  line2: props.lines[2] ?? "",
  backgroundColor: props.backgroundColor,
  accentColor: props.accentColor,
  template: props.template,
  ratio: props.ratio,
  durationInSeconds: props.durationInSeconds,
});

/** 表单值 -> 组件参数。仅在通过校验后调用。 */
export const toVideoProps = (values: VideoFormValues): VideoProps => ({
  title: values.title.trim(),
  lines: [values.line0.trim(), values.line1.trim(), values.line2.trim()],
  backgroundColor: values.backgroundColor.trim().toUpperCase(),
  accentColor: values.accentColor.trim().toUpperCase(),
  template: values.template,
  ratio: values.ratio,
  durationInSeconds: values.durationInSeconds,
  durationMode: "fixed",
  narration: DEFAULT_VIDEO_PROPS.narration,
  subtitles: DEFAULT_VIDEO_PROPS.subtitles,
  layers: [],
});

/** 预览时使用：不弹错误，只做轻量兜底，保证画面不会因空值崩溃 */
export const toPreviewProps = (values: VideoFormValues): VideoProps => {
  const result = validateVideoInput({
    title: values.title,
    lines: [values.line0, values.line1, values.line2],
    backgroundColor: values.backgroundColor,
    accentColor: values.accentColor,
    template: values.template,
    ratio: values.ratio,
    durationInSeconds: values.durationInSeconds,
  });

  if (result.ok) {
    return result.value;
  }

  const duration =
    Number.isFinite(values.durationInSeconds) &&
    values.durationInSeconds >= DURATION_LIMITS.min &&
    values.durationInSeconds <= DURATION_LIMITS.max
      ? values.durationInSeconds
      : DEFAULT_DURATION_SECONDS;

  return {
    title: values.title.trim() || DEFAULT_VIDEO_PROPS.title,
    lines: [values.line0, values.line1, values.line2].map(
      (line, index) => line.trim() || DEFAULT_VIDEO_PROPS.lines[index],
    ),
    backgroundColor: HEX_COLOR_PATTERN.test(values.backgroundColor.trim())
      ? normalizeColor(values.backgroundColor)
      : DEFAULT_VIDEO_PROPS.backgroundColor,
    accentColor: HEX_COLOR_PATTERN.test(values.accentColor.trim())
      ? normalizeColor(values.accentColor)
      : DEFAULT_VIDEO_PROPS.accentColor,
    template: isTemplateId(values.template) ? values.template : DEFAULT_TEMPLATE,
    ratio: isRatioId(values.ratio) ? values.ratio : DEFAULT_RATIO,
    durationInSeconds: duration,
    durationMode: "fixed",
    narration: DEFAULT_VIDEO_PROPS.narration,
    subtitles: DEFAULT_VIDEO_PROPS.subtitles,
    layers: [],
  };
};

export const validateFormValues = (values: VideoFormValues): ValidationResult =>
  validateVideoInput({
    title: values.title,
    lines: [values.line0, values.line1, values.line2],
    backgroundColor: values.backgroundColor,
    accentColor: values.accentColor,
    template: values.template,
    ratio: values.ratio,
    durationInSeconds: values.durationInSeconds,
  });
