import { createEditorDraft, type EditorDraft } from "../lib/projectDraft";
import { createEffect, type EffectPresetId, type VideoEffect } from "../remotion/effects";
import { createImageLayer, createTextLayer, imageHeightForWidth } from "../remotion/layers";
import { DEFAULT_VIDEO_PROPS, toFormValues, type VideoProps } from "../remotion/params";
import { buildScriptFromLines } from "../remotion/narration";
import type { TtsRecord } from "../lib/tts/types";

export const DEMO_VERSION = 1;
export const DEMO_SAMPLES = [
  { id: "math", name: "数学微课", title: "看见正弦函数", description: "Manim 公式变形、函数描线与跟随点", template: "editorial", ratio: "16:9", color: "#F5AD58", lines: ["振幅决定曲线有多高。", "频率改变波形的疏密。", "调整参数，观察变化。"] },
  { id: "story", name: "图文短片", title: "把知识讲生动", description: "文字排版、网页动效、手绘标记", template: "cards", ratio: "9:16", color: "#62D6BF", lines: ["写清楚一个观点。", "用画面标出重点。", "让声音和字幕一起讲解。"] },
  { id: "space", name: "三维讲解", title: "换个角度看空间", description: "Three.js 几何投影、空间轨道与镜头运动", template: "split", ratio: "16:9", color: "#82B8FF", lines: ["旋转，观察每一面。", "沿着轨道，追踪运动。", "组合镜头，连接知识。"] },
] as const;
export type DemoSampleId = typeof DEMO_SAMPLES[number]["id"];
export const demoSampleId = (raw: string | null): DemoSampleId => DEMO_SAMPLES.find(s => s.id === raw)?.id ?? "math";
export const demoDraftKey = (id: DemoSampleId) => `codevideo:demo:${id}:project:v1`;
export const DEMO_SELECTION_KEY = "codevideo:demo:merge:selection";
export const DEMO_MERGE_KEY = "codevideo:demo:merge:project:v1";
export const DEMO_VIEW_KEY = "codevideo:demo:view";

const effect = (sample: string, preset: EffectPresetId, patch: Partial<VideoEffect>): VideoEffect => ({
  ...createEffect(preset), id: `demo-${sample}-${preset}`, color: "#62D6BF", secondaryColor: "#F1F5F9", ...patch,
});

/** Stable editable content, without any machine-specific asset IDs or prerecorded results. */
export function createDemoDraft(id: DemoSampleId, imageUrl?: string): EditorDraft {
  const sample = DEMO_SAMPLES.find(s => s.id === id)!;
  const props = { ...DEFAULT_VIDEO_PROPS, title: sample.title, lines: [...sample.lines], template: sample.template, ratio: sample.ratio, durationInSeconds: 15, backgroundColor: "#101D2B", accentColor: sample.color };
  const draft = { ...createEditorDraft(), values: toFormValues(props), tab: "effects" as const,
    videoName: `Demo · ${sample.name}`, nameTouched: true,
    script: buildScriptFromLines(sample.title, [...sample.lines]), scriptTouched: true,
    speed: 1.15, durationMode: "fixed" as const, subtitleBg: .65,
  };
  draft.layers = [createTextLayer({ id: `demo-${id}-label`, name: "章节标签", text: id === "math" ? "MATH / 01" : id === "story" ? "知识短片 / 02" : "SPACE / 03",
    x: id === "math" ? .78 : .5, y: .08, fontSize: 20, fontWeight: 400, color: sample.color, boxWidth: .28, endFrame: 450 })];
  if (imageUrl) {
    const canvas = { width: id === "story" ? 1080 : 1920, height: id === "story" ? 1920 : 1080 };
    const width = id === "math" ? .36 : .14;
    draft.layers.unshift(createImageLayer({ id: `demo-${id}-asset`, name: "数学演示板", url: imageUrl, width: 680, height: 800 }, canvas,
      { id: `demo-${id}-image`, x: id === "math" ? .78 : .82, y: id === "math" ? .5 : .12, width, height: imageHeightForWidth(width, 680 / 800, canvas), endFrame: 450 }));
  }
  draft.selectedLayerId = draft.layers[0].id;
  if (id === "math") draft.effects = [
    effect(id, "math-formula", { text: "y = \\sin(x)", targetText: "y = 1.5\\sin(2x)", variant: "transform", x: .78, y: .46, size: .62, color: sample.color, secondaryColor: sample.color, endFrame: 180 }),
    effect(id, "math-sine", { amplitude: 1.5, frequency: 2, offset: 0, startFrame: 180, x: .78, y: .5, size: .62, color: sample.color }),
    effect(id, "motion-fade", { intensity: .5, color: "#101D2B" }),
  ];
  if (id === "story") draft.effects = [
    effect(id, "web-card", { text: "一个观点，一段短片", x: .5, y: .81, size: .82, endFrame: 120 }),
    effect(id, "web-bars", { name: "示例数据图（非实测）", text: "示例数据", values: [30, 60, 90], x: .5, y: .81, size: .75, startFrame: 120, endFrame: 330 }),
    effect(id, "draw-marker", { text: "标记重点", x: .5, y: .81, size: .75, startFrame: 330 }),
    effect(id, "draw-circle", { text: "可编辑", x: .8, y: .12, size: .23, startFrame: 240 }),
  ];
  if (id === "space") draft.effects = [
    effect(id, "three-cube", { x: .17, y: .73, size: .48, color: sample.color, endFrame: 225 }),
    effect(id, "three-orbit", { x: .17, y: .73, size: .48, startFrame: 225, color: sample.color }),
    effect(id, "motion-zoom", { intensity: .25, speed: .6 }),
  ];
  draft.selectedEffectId = draft.effects[0].id;
  return draft;
}

export function demoVideoProps(draft: EditorDraft, voice: TtsRecord): VideoProps {
  return {
    ...DEFAULT_VIDEO_PROPS, title: draft.values.title, lines: [draft.values.line0, draft.values.line1, draft.values.line2],
    template: draft.values.template, ratio: draft.values.ratio, durationInSeconds: draft.values.durationInSeconds,
    backgroundColor: draft.values.backgroundColor, accentColor: draft.values.accentColor, durationMode: draft.durationMode,
    layers: draft.layers, effects: draft.effects,
    narration: { ...DEFAULT_VIDEO_PROPS.narration, enabled: true, ttsId: voice.id, audioSrc: `/api/tts/${voice.id}/audio`, script: voice.script,
      voiceId: voice.voiceId, voiceName: voice.voiceName, provider: voice.provider, speed: voice.speed, volume: draft.volume, audioDurationSeconds: voice.durationSeconds, scenes: voice.scenes },
    subtitles: { enabled: true, color: draft.subtitleColor, fontScale: draft.fontScale, backgroundOpacity: draft.subtitleBg, position: draft.subtitlePos, cues: voice.cues },
  };
}

export type DemoPreparedSample = { draft: EditorDraft; videoId: string };
export type DemoManifest = { version: number; samples: Partial<Record<DemoSampleId, DemoPreparedSample>>; boardUrl?: string; mergedId?: string };
export type DemoStatus = { status: "idle" | "preparing" | "ready" | "failed"; message: string; progress: number; manifest: DemoManifest };
