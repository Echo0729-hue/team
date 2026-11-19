import { DEFAULT_VIDEO_PROPS, isRatioId, isTemplateId, toFormValues, type VideoFormValues } from "../remotion/params";
import { buildScriptFromLines, type DurationMode } from "../remotion/narration";
import { sanitizeLayers, type Layer } from "../remotion/layers";
import { sanitizeEffects, type VideoEffect } from "../remotion/effects";
import type { SubtitlePosition } from "../remotion/subtitles";
import type { TtsResult } from "./tts/types";

export const DRAFT_KEY = "codevideo:project:v1";
export type EditorTab = "content" | "visual" | "layers" | "effects" | "voice" | "subtitle";
export type EditorDraft = {
  tab: EditorTab;
  values: VideoFormValues;
  videoName: string;
  nameTouched: boolean;
  voiceEnabled: boolean;
  script: string;
  scriptTouched: boolean;
  voiceId: string;
  speed: number;
  volume: number;
  tts: TtsResult | null;
  ttsId: string | null;
  durationMode: DurationMode;
  subtitleEnabled: boolean;
  subtitleTexts: string[];
  fontScale: number;
  subtitleColor: string;
  subtitleBg: number;
  subtitlePos: SubtitlePosition;
  layers: Layer[];
  selectedLayerId: string | null;
  effects: VideoEffect[];
  selectedEffectId: string | null;
  jobId: string | null;
};
export const createEditorDraft = (): EditorDraft => ({
  tab: "content", values: toFormValues(DEFAULT_VIDEO_PROPS),
  videoName: DEFAULT_VIDEO_PROPS.title, nameTouched: false, voiceEnabled: false,
  script: buildScriptFromLines(DEFAULT_VIDEO_PROPS.title, DEFAULT_VIDEO_PROPS.lines), scriptTouched: false,
  voiceId: "", speed: 1, volume: 0.9, tts: null, ttsId: null, durationMode: "voice",
  subtitleEnabled: true, subtitleTexts: [], fontScale: 1, subtitleColor: "#FFFFFF",
  subtitleBg: 0.45, subtitlePos: "bottom", layers: [], selectedLayerId: null, effects: [], selectedEffectId: null, jobId: null,
});
const object = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (value: unknown, fallback: string): string => typeof value === "string" ? value.slice(0, 10000) : fallback;
const number = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const color = (value: unknown, fallback: string): string => typeof value === "string" && /^#[a-f\d]{6}$/i.test(value) ? value : fallback;

/** Restore incomplete text as written: an invalid form is still a user's draft. */
export const decodeEditorDraft = (raw: string): EditorDraft => {
  const envelope = object(JSON.parse(raw));
  if (envelope.version !== 1 || !envelope.data || Array.isArray(envelope.data) || typeof envelope.data !== "object") {
    throw new Error("草稿版本无法识别");
  }
  const data = object(envelope.data);
  const draft = createEditorDraft();
  const values = object(data.values);
  for (const key of ["title", "line0", "line1", "line2", "backgroundColor", "accentColor"] as const) {
    draft.values[key] = text(values[key], draft.values[key]);
  }
  draft.values.template = isTemplateId(values.template) ? values.template : draft.values.template;
  draft.values.ratio = isRatioId(values.ratio) ? values.ratio : draft.values.ratio;
  draft.values.durationInSeconds = number(values.durationInSeconds, 15, 5, 15);
  if (["content", "visual", "layers", "effects", "voice", "subtitle"].includes(String(data.tab))) draft.tab = data.tab as EditorTab;
  for (const key of ["videoName", "script", "voiceId"] as const) draft[key] = text(data[key], draft[key]);
  for (const key of ["nameTouched", "voiceEnabled", "scriptTouched", "subtitleEnabled"] as const) {
    if (typeof data[key] === "boolean") draft[key] = data[key];
  }
  draft.speed = number(data.speed, 1, 0.75, 1.5);
  draft.volume = number(data.volume, 0.9, 0, 1);
  draft.fontScale = number(data.fontScale, 1, 0.8, 1.5);
  draft.subtitleBg = number(data.subtitleBg, 0.45, 0, 0.9);
  draft.subtitleColor = color(data.subtitleColor, "#FFFFFF");
  draft.subtitlePos = data.subtitlePos === "lower" ? "lower" : "bottom";
  draft.durationMode = data.durationMode === "fixed" ? "fixed" : "voice";
  draft.subtitleTexts = Array.isArray(data.subtitleTexts) ? data.subtitleTexts.slice(0, 120).map((item) => text(item, "")) : [];
  draft.layers = sanitizeLayers(data.layers, 450);
  draft.effects = sanitizeEffects(data.effects, 450);
  draft.selectedEffectId = typeof data.selectedEffectId === "string" && draft.effects.some((effect) => effect.id === data.selectedEffectId) ? data.selectedEffectId : null;
  draft.selectedLayerId = typeof data.selectedLayerId === "string" && draft.layers.some((layer) => layer.id === data.selectedLayerId) ? data.selectedLayerId : null;
  draft.jobId = typeof data.jobId === "string" && /^[a-f\d-]{36}$/i.test(data.jobId) ? data.jobId : null;
  // Fetch audio metadata from the server before allowing a restored narration to export.
  const ttsId = data.ttsId;
  draft.ttsId = typeof ttsId === "string" && /^[a-f\d]{20}$/.test(ttsId) ? ttsId : null;
  return draft;
};

export const encodeEditorDraft = (data: EditorDraft): string =>
  JSON.stringify({ version: 1, savedAt: new Date().toISOString(), data: { ...data, tts: undefined } });
