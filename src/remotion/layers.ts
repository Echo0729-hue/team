/**
 * 画面图层：文字与图片叠在模板之上，编辑画布、网页预览与服务端导出共用这一份数据。
 * 坐标、尺寸、字体大小都按 1080 宽的设计稿归一化，换比例时不需要重新排版。
 */

/** 上传图片的统一地址前缀 */
export const LAYER_IMAGE_PREFIX = "/api/uploads/";

export const LAYER_FONTS = [
  { id: "heiti", name: "黑体", stack: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", "SimHei", sans-serif' },
  { id: "songti", name: "宋体", stack: '"SimSun", "Songti SC", "Noto Serif SC", STSong, serif' },
  { id: "kaiti", name: "楷体", stack: '"KaiTi", "STKaiti", "Kaiti SC", "Microsoft YaHei", serif' },
  { id: "dengxian", name: "等线", stack: '"DengXian", "Microsoft YaHei", "PingFang SC", sans-serif' },
] as const;

export type LayerFontId = (typeof LAYER_FONTS)[number]["id"];

export const DEFAULT_LAYER_FONT: LayerFontId = "heiti";

export const getLayerFontStack = (id: LayerFontId): string =>
  LAYER_FONTS.find((font) => font.id === id)?.stack ?? LAYER_FONTS[0].stack;

export type LayerKind = "text" | "image";
export type TextAlign = "left" | "center" | "right";
export type ImageFit = "contain" | "cover";

export type LayerBase = {
  id: string;
  name: string;
  kind: LayerKind;
  /** 中心点，0~1 相对画布宽高 */
  x: number;
  y: number;
  /** 旋转角度（度），绕中心点 */
  rotation: number;
  opacity: number;
  startFrame: number;
  endFrame: number;
  hidden: boolean;
  locked: boolean;
};

export type TextLayer = LayerBase & {
  kind: "text";
  text: string;
  fontId: LayerFontId;
  /** 字号，按 1080 宽设计稿 */
  fontSize: number;
  fontWeight: 400 | 700;
  italic: boolean;
  color: string;
  align: TextAlign;
  /** 行高倍数 */
  lineHeight: number;
  /** 字间距，按 1080 宽设计稿 */
  letterSpacing: number;
  strokeColor: string;
  strokeWidth: number;
  shadow: { enabled: boolean; color: string; offsetX: number; offsetY: number; blur: number };
  /** 文本框宽度，0~1 相对画布宽度 */
  boxWidth: number;
};

export type ImageLayer = LayerBase & {
  kind: "image";
  /** 上传后的地址，如 /api/uploads/xxx.png */
  src: string;
  /** 宽度，0~1 相对画布宽度 */
  width: number;
  /** 高度，0~1 相对画布高度 */
  height: number;
  /** 原始宽高比 w/h */
  aspect: number;
  fit: ImageFit;
};

export type Layer = TextLayer | ImageLayer;

export const LAYER_LIMITS = {
  maxLayers: 20,
  textMaxLength: 300,
  fontSizeMin: 12,
  fontSizeMax: 200,
  boxWidthMin: 0.08,
  boxWidthMax: 1,
  opacityMin: 0.05,
  opacityMax: 1,
  rotationMin: -180,
  rotationMax: 180,
  strokeWidthMax: 20,
  letterSpacingMin: -20,
  letterSpacingMax: 80,
  lineHeightMin: 0.8,
  lineHeightMax: 3,
  imageWidthMin: 0.05,
  imageWidthMax: 1.5,
} as const;

const HEX = /^#[0-9a-fA-F]{6}$/;
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value));
const round = (value: number, digits = 4): number => Number(value.toFixed(digits));

let layerSeq = 0;
export const createLayerId = (): string => {
  layerSeq += 1;
  return `layer-${Date.now().toString(36)}-${layerSeq}`;
};

export const createTextLayer = (options?: Partial<TextLayer>): TextLayer => ({
  id: createLayerId(),
  name: "文字",
  kind: "text",
  x: 0.5,
  y: 0.5,
  rotation: 0,
  opacity: 1,
  startFrame: 0,
  endFrame: Number.MAX_SAFE_INTEGER,
  hidden: false,
  locked: false,
  text: "在这里输入文字",
  fontId: DEFAULT_LAYER_FONT,
  fontSize: 64,
  fontWeight: 700,
  italic: false,
  color: "#FFFFFF",
  align: "center",
  lineHeight: 1.3,
  letterSpacing: 0,
  strokeColor: "#000000",
  strokeWidth: 0,
  shadow: { enabled: true, color: "#000000", offsetX: 0, offsetY: 4, blur: 12 },
  boxWidth: 0.8,
  ...options,
});

export const createImageLayer = (
  upload: { id: string; url: string; name: string; width: number; height: number },
  canvas: { width: number; height: number },
  options?: Partial<ImageLayer>,
): ImageLayer => {
  const aspect = upload.height > 0 ? upload.width / upload.height : 1;
  const width = 0.5;
  // 宽度按画布宽归一化，高度换算到画布高
  const height = round((width * (canvas.width / canvas.height)) / aspect, 4);
  return {
    id: createLayerId(),
    name: upload.name || "图片",
    kind: "image",
    x: 0.5,
    y: 0.5,
    rotation: 0,
    opacity: 1,
    startFrame: 0,
    endFrame: Number.MAX_SAFE_INTEGER,
    hidden: false,
    locked: false,
    src: upload.url,
    width,
    height,
    aspect,
    fit: "contain",
    ...options,
  };
};

export const isTextLayer = (layer: Layer): layer is TextLayer => layer.kind === "text";
export const isImageLayer = (layer: Layer): layer is ImageLayer => layer.kind === "image";

export const sortLayers = (layers: readonly Layer[]): Layer[] =>
  [...layers].sort((a, b) => a.startFrame - b.startFrame || a.id.localeCompare(b.id));

const readNumber = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;

/** 前端与 API 共用的图层清洗：限制数量、坐标、样式与时间窗口 */
export const sanitizeLayers = (raw: unknown, totalFrames: number): Layer[] => {
  if (!Array.isArray(raw)) {
    return [];
  }

  const layers: Layer[] = [];

  for (const entry of raw.slice(0, LAYER_LIMITS.maxLayers)) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const item = entry as Record<string, unknown>;
    const kind = item.kind === "image" ? "image" : item.kind === "text" ? "text" : null;
    if (!kind) {
      continue;
    }

    const id = typeof item.id === "string" && item.id.length > 0 ? item.id.slice(0, 64) : createLayerId();
    const startFrame = clamp(Math.round(readNumber(item.startFrame, 0)), 0, totalFrames);
    const endFrame = clamp(Math.round(readNumber(item.endFrame, totalFrames)), startFrame + 1, totalFrames);
    const base = {
      id,
      name: typeof item.name === "string" ? item.name.slice(0, 40) : kind === "text" ? "文字" : "图片",
      kind,
      x: round(clamp(readNumber(item.x, 0.5), -0.2, 1.2)),
      y: round(clamp(readNumber(item.y, 0.5), -0.2, 1.2)),
      rotation: round(clamp(readNumber(item.rotation, 0), LAYER_LIMITS.rotationMin, LAYER_LIMITS.rotationMax), 2),
      opacity: round(clamp(readNumber(item.opacity, 1), LAYER_LIMITS.opacityMin, LAYER_LIMITS.opacityMax), 2),
      startFrame,
      endFrame,
      hidden: item.hidden === true,
      locked: item.locked === true,
    };

    if (kind === "text") {
      const shadowSource = (typeof item.shadow === "object" && item.shadow !== null ? item.shadow : {}) as Record<string, unknown>;
      const fontId = LAYER_FONTS.some((font) => font.id === item.fontId)
        ? (item.fontId as LayerFontId)
        : DEFAULT_LAYER_FONT;
      const align = item.align === "left" || item.align === "right" ? item.align : "center";

      layers.push({
        ...base,
        kind: "text",
        text: typeof item.text === "string" ? item.text.slice(0, LAYER_LIMITS.textMaxLength) : "",
        fontId,
        fontSize: Math.round(clamp(readNumber(item.fontSize, 64), LAYER_LIMITS.fontSizeMin, LAYER_LIMITS.fontSizeMax)),
        fontWeight: item.fontWeight === 400 ? 400 : 700,
        italic: item.italic === true,
        color: typeof item.color === "string" && HEX.test(item.color) ? item.color.toUpperCase() : "#FFFFFF",
        align,
        lineHeight: round(clamp(readNumber(item.lineHeight, 1.3), LAYER_LIMITS.lineHeightMin, LAYER_LIMITS.lineHeightMax), 2),
        letterSpacing: round(clamp(readNumber(item.letterSpacing, 0), LAYER_LIMITS.letterSpacingMin, LAYER_LIMITS.letterSpacingMax), 1),
        strokeColor: typeof item.strokeColor === "string" && HEX.test(item.strokeColor) ? item.strokeColor.toUpperCase() : "#000000",
        strokeWidth: round(clamp(readNumber(item.strokeWidth, 0), 0, LAYER_LIMITS.strokeWidthMax), 1),
        shadow: {
          enabled: shadowSource.enabled === true,
          color: typeof shadowSource.color === "string" && HEX.test(shadowSource.color) ? shadowSource.color.toUpperCase() : "#000000",
          offsetX: round(clamp(readNumber(shadowSource.offsetX, 0), -40, 40), 1),
          offsetY: round(clamp(readNumber(shadowSource.offsetY, 4), -40, 40), 1),
          blur: round(clamp(readNumber(shadowSource.blur, 12), 0, 60), 1),
        },
        boxWidth: round(clamp(readNumber(item.boxWidth, 0.8), LAYER_LIMITS.boxWidthMin, LAYER_LIMITS.boxWidthMax), 3),
      });
      continue;
    }

    const rawSrc = typeof item.src === "string" ? item.src : "";
    if (!rawSrc.startsWith(LAYER_IMAGE_PREFIX)) {
      continue;
    }
    // 只接受 <uuid>.<ext> 形式的文件名，避免 .. 之类的路径穿越
    const fileName = rawSrc.slice(LAYER_IMAGE_PREFIX.length);
    if (!/[A-Za-z0-9-]+\.(png|jpg|jpeg|webp)$/i.test(fileName)) {
      continue;
    }
    const src = `${LAYER_IMAGE_PREFIX}${fileName}`;
    const aspect = clamp(readNumber(item.aspect, 1), 0.1, 10);
    const width = round(clamp(readNumber(item.width, 0.5), LAYER_LIMITS.imageWidthMin, LAYER_LIMITS.imageWidthMax), 4);
    const height = round(clamp(readNumber(item.height, width), 0.05, 1.5), 4);

    layers.push({
      ...base,
      kind: "image",
      src,
      width,
      height,
      aspect,
      fit: item.fit === "cover" ? "cover" : "contain",
    });
  }

  return layers;
};

