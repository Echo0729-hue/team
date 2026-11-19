/** Serializable effect components shared by drafts, the API, preview and MP4 rendering. */
export const EFFECT_CATEGORIES = [
  { id: "web", name: "网页动效", description: "信息卡片与数据图表" },
  { id: "draw", name: "手绘画面", description: "逐帧绘制标记与笔触" },
  { id: "three", name: "三维画面", description: "旋转几何与空间轨道" },
  { id: "math", name: "数学动画", description: "Manim 公式书写、变换与函数描线" },
  { id: "motion", name: "镜头与时间线", description: "整段淡入淡出与镜头运动" },
] as const;
export type EffectCategory = (typeof EFFECT_CATEGORIES)[number]["id"];
export const EFFECT_PRESETS = [
  { id: "web-card", category: "web", name: "浮动信息卡", description: "让一条重点信息浮现在画面上", text: "这里是重点信息", variant: "rounded" },
  { id: "web-bars", category: "web", name: "生长柱状图", description: "输入真实数值，逐项展示对比", text: "数据对比", variant: "rounded" },
  { id: "draw-marker", category: "draw", name: "手绘荧光笔", description: "用有层次的笔触标记重点", text: "标记重点", variant: "pencil" },
  { id: "draw-circle", category: "draw", name: "手绘圈注", description: "动态圈出一个关键词或区域", text: "关注这里", variant: "pencil" },
  { id: "three-cube", category: "three", name: "旋转几何体", description: "有透视的立方体或八面体", text: "", variant: "cube" },
  { id: "three-orbit", category: "three", name: "空间轨道", description: "三维轨道与运动粒子", text: "", variant: "orbit" },
  { id: "math-formula", category: "math", name: "公式推演", description: "Manim 书写公式，演示前后变换", text: "E = mc^2", variant: "reveal" },
  { id: "math-sine", category: "math", name: "函数描线", description: "Manim 坐标系、曲线与跟随点", text: "y = sin(x)", variant: "sine" },
  { id: "motion-fade", category: "motion", name: "片段淡入淡出", description: "控制选定时间段的画面显现与收尾", text: "", variant: "fade" },
  { id: "motion-zoom", category: "motion", name: "镜头推进", description: "平滑推进再回到原构图", text: "", variant: "zoom" },
] as const;
export type EffectPresetId = (typeof EFFECT_PRESETS)[number]["id"];
export const MAX_EFFECTS = 16;
export type VideoEffect = {
  id: string;
  preset: EffectPresetId;
  name: string;
  hidden: boolean;
  startFrame: number;
  /** null follows the end of the video, including when its duration changes. */
  endFrame: number | null;
  x: number;
  y: number;
  size: number;
  rotation: number;
  opacity: number;
  color: string;
  secondaryColor: string;
  text: string;
  targetText: string;
  amplitude: number;
  frequency: number;
  offset: number;
  intensity: number;
  speed: number;
  variant: string;
  values: number[];
  entrance: "fade" | "rise" | "none";
  /** Layering relative to the existing image/text overlays. */
  placement: "back" | "front";
};
export const getEffectPreset = (id: EffectPresetId) => EFFECT_PRESETS.find((preset) => preset.id === id)!;
export const effectVariants = (id: EffectPresetId): readonly { id: string; name: string }[] => {
  switch (id) {
    case "web-card": case "web-bars": return [{ id: "rounded", name: "圆角" }, { id: "sharp", name: "直角" }];
    case "draw-marker": case "draw-circle": return [{ id: "pencil", name: "铅笔" }, { id: "brush", name: "宽笔刷" }];
    case "three-cube": return [{ id: "cube", name: "立方体" }, { id: "octahedron", name: "八面体" }];
    case "three-orbit": return [{ id: "orbit", name: "三条轨道" }, { id: "atom", name: "六条轨道" }];
    case "math-sine": return [{ id: "sine", name: "正弦函数" }, { id: "parabola", name: "抛物线" }];
    case "math-formula": return [{ id: "reveal", name: "逐笔书写" }, { id: "transform", name: "公式变换" }, { id: "static", name: "完整展示" }];
    case "motion-fade": return [{ id: "fade", name: "淡入淡出" }, { id: "in", name: "仅淡入" }, { id: "out", name: "仅淡出" }];
    case "motion-zoom": return [{ id: "zoom", name: "推进" }, { id: "pan", name: "横向平移" }];
  }
};
let effectSeq = 0;
export const createEffectId = () => `effect-${Date.now().toString(36)}-${++effectSeq}`;
export const createEffect = (preset: EffectPresetId): VideoEffect => ({
  id: createEffectId(), preset, name: getEffectPreset(preset).name, hidden: false,
  startFrame: 0, endFrame: null, x: 0.5, y: 0.78, size: 0.65, rotation: 0,
  opacity: 1, color: "#38BDF8", secondaryColor: "#FFFFFF",
  text: getEffectPreset(preset).text, targetText: "m = \\frac{E}{c^2}", amplitude: 1, frequency: 1, offset: 0, intensity: 0.65, speed: 1,
  variant: getEffectPreset(preset).variant, values: [30, 65, 90], entrance: "fade", placement: "front",
});
const clamp = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const color = (value: unknown, fallback: string) => typeof value === "string" && /^#[\da-f]{6}$/i.test(value) ? value.toUpperCase() : fallback;

export const sanitizeEffects = (raw: unknown, totalFrames: number): VideoEffect[] => {
  if (!Array.isArray(raw)) return [];
  const effects: VideoEffect[] = [];
  const total = Math.max(1, Math.round(totalFrames));
  for (const entry of raw.slice(0, MAX_EFFECTS)) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const item = entry as Record<string, unknown>;
    const preset = EFFECT_PRESETS.find((p) => p.id === item.preset);
    if (!preset) continue;
    const defaults = createEffect(preset.id);
    const id = typeof item.id === "string" && item.id ? item.id.slice(0, 80) : defaults.id;
    if (effects.some((effect) => effect.id === id)) continue;
    const startFrame = Math.round(clamp(item.startFrame, 0, 0, total - 1));
    const variants = effectVariants(preset.id);
    effects.push({
      ...defaults, id, name: typeof item.name === "string" ? item.name.slice(0, 40) : defaults.name,
      hidden: item.hidden === true, startFrame,
      endFrame: item.endFrame == null ? null : Math.round(clamp(item.endFrame, total, startFrame + 1, total)),
      x: clamp(item.x, 0.5, 0, 1), y: clamp(item.y, 0.78, 0, 1),
      size: clamp(item.size, 0.65, 0.15, 1.5), rotation: clamp(item.rotation, 0, -180, 180),
      opacity: clamp(item.opacity, 1, 0, 1), color: color(item.color, defaults.color),
      secondaryColor: color(item.secondaryColor, defaults.secondaryColor),
      text: typeof item.text === "string" ? Array.from(item.text).slice(0, 180).join("") : defaults.text,
      targetText: typeof item.targetText === "string" ? Array.from(item.targetText).slice(0, 180).join("") : defaults.targetText,
      amplitude: clamp(item.amplitude, 1, 0.1, 3), frequency: clamp(item.frequency, 1, 0.25, 3), offset: clamp(item.offset, 0, -2, 2),
      intensity: clamp(item.intensity, 0.65, 0, 1), speed: clamp(item.speed, 1, 0.25, 3),
      variant: variants.some((v) => v.id === item.variant) ? item.variant as string : defaults.variant,
      values: Array.isArray(item.values) && item.values.length ? item.values.slice(0, 6).map((v) => clamp(v, 0, 0, 100)) : defaults.values,
      entrance: item.entrance === "rise" || item.entrance === "none" ? item.entrance : "fade",
      placement: item.placement === "back" ? "back" : "front",
    });
  }
  return effects;
};

/** End is exclusive, just like all other tracks. Frame time is the only clock. */
export const effectTiming = (effect: VideoEffect, frame: number, totalFrames: number, fps: number) => {
  const end = Math.min(totalFrames, effect.endFrame ?? totalFrames);
  const length = Math.max(1, end - effect.startFrame);
  const local = frame - effect.startFrame;
  const edgeFrames = Math.max(1, Math.min(length / 3, fps * 0.45 / effect.speed));
  return {
    active: !effect.hidden && local >= 0 && frame < end,
    local, length, seconds: local / fps,
    progress: Math.max(0, Math.min(1, local / Math.max(1, length - 1))),
    entrance: effect.entrance === "none" ? 1 : Math.max(0, Math.min(1, (local + 1) / edgeFrames, (end - frame) / edgeFrames)),
    edgeFrames,
  };
};
