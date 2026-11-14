import { narrationContentKey, normalizeScript, parseNarrationScenes, sanitizeNarrationScenes } from "../remotion/narration";
import { getDurationInFrames, validateVideoInput, type VideoProps } from "../remotion/params";
import { sanitizeCues } from "../remotion/subtitles";
import type { TtsRecord } from "./tts/types";

export class NarrationValidationError extends Error {
  constructor(message: string, public code = "TTS_STALE") { super(message); }
}

/** The file record is authoritative; client durations, URLs and scene timestamps are not. */
export const prepareNarratedVideo = (props: VideoProps, record: TtsRecord | null): VideoProps => {
  if (!props.narration.enabled) return props;
  if (!record || props.narration.ttsId !== record.id) {
    throw new NarrationValidationError("配音文件已失效，请重新生成配音后导出。", "TTS_MISSING");
  }
  const narration = props.narration;
  if (normalizeScript(narration.script) !== record.script || narration.voiceId !== record.voiceId ||
    Math.abs(narration.speed - record.speed) > 0.001 || record.contentKey !== narrationContentKey(props)) {
    throw new NarrationValidationError("文案、讲稿、音色或语速已修改，请重新生成配音后导出。");
  }
  const scenes = sanitizeNarrationScenes(record.scenes);
  const paragraphs = parseNarrationScenes(record.script);
  if (scenes.length !== 4 || !paragraphs || scenes.some((scene, index) => scene.text !== paragraphs[index])) {
    throw new NarrationValidationError("这份配音缺少画面时间轴，请重新生成配音。", "TTS_SCENES_REQUIRED");
  }
  const canonical = {
    ...props,
    narration: { ...narration, audioSrc: `/api/tts/${record.id}/audio`, provider: record.provider,
      audioDurationSeconds: record.durationSeconds, voiceName: record.voiceName, scenes },
  };
  const checked = validateVideoInput(canonical);
  if (!checked.ok) throw new NarrationValidationError(Object.values(checked.errors).join(" "), "TTS_DURATION_INVALID");
  const total = getDurationInFrames(checked.value);
  if (scenes[3].endFrame > total) throw new NarrationValidationError("视频时长不足以容纳完整配音，请延长时长。", "TTS_DURATION_INVALID");
  // Text edits are allowed, but audio-measured cue intervals cannot be overridden by a client.
  checked.value.subtitles.cues = sanitizeCues(record.cues.map((cue) => {
    const submitted = props.subtitles.cues.find((item) => item.startFrame === cue.startFrame && item.endFrame === cue.endFrame);
    const text = submitted ? submitted.text : cue.text;
    return { text, startFrame: cue.startFrame, endFrame: cue.endFrame };
  }), 30, total);
  return checked.value;
};
