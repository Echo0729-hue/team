/**
 * 配音参数：语音服务、音量、以及「跟随配音时长」的规则。
 * 预览与导出读同一份 narration（audioSrc 在浏览器里指向 /api/tts/...，渲染时指向 bundle 服务）。
 */

export type TtsProviderId = "local" | "openai" | "azure";

export type NarrationProps = {
  enabled: boolean;
  /** 配音记录 id（output/tts/<id>.json） */
  ttsId: string | null;
  /** 音频地址：预览用相对地址，导出时替换为可被 Chrome 访问的绝对地址 */
  audioSrc: string | null;
  script: string;
  voiceId: string | null;
  voiceName: string | null;
  provider: TtsProviderId | null;
  /** 语速倍率 0.75~1.5，1 为正常 */
  speed: number;
  /** 成片音量 0~1 */
  volume: number;
  /** 语音服务测得的音频总时长（秒） */
  audioDurationSeconds: number;
};

export const NARRATION_LIMITS = {
  scriptMaxLength: 600,
  speedMin: 0.75,
  speedMax: 1.5,
  speedStep: 0.05,
  volumeMin: 0,
  volumeMax: 1,
} as const;

export const DEFAULT_NARRATION: NarrationProps = {
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
};

/** 时长模式：固定时长 / 跟随配音 */
export type DurationMode = "fixed" | "voice";

/** 配音结束后留给画面的余量（秒） */
export const NARRATION_TAIL_SECONDS = 0.35;

export const clampSpeed = (value: number): number =>
  Math.min(NARRATION_LIMITS.speedMax, Math.max(NARRATION_LIMITS.speedMin, Math.round(value * 100) / 100));

export const clampVolume = (value: number): number =>
  Math.min(NARRATION_LIMITS.volumeMax, Math.max(NARRATION_LIMITS.volumeMin, Math.round(value * 100) / 100));

/**
 * 由音频时长推导画面时长：
 * - 不足 5 秒：按 5 秒，画面多留一会儿，不截断音频；
 * - 5~15 秒：跟随实际讲解时长（向上取到 0.5 秒，保证最后一个字不被切掉）；
 * - 超过 15 秒：返回 null，由调用方提示「拆镜头 / 缩短讲稿 / 降速」。
 */
export const resolveDurationFromAudio = (
  audioSeconds: number,
  min = 5,
  max = 15,
): number | null => {
  if (!Number.isFinite(audioSeconds) || audioSeconds <= 0) {
    return null;
  }
  if (audioSeconds > max) {
    return null;
  }
  const withTail = Math.ceil((audioSeconds + NARRATION_TAIL_SECONDS) * 2) / 2;
  return Math.min(max, Math.max(min, withTail));
};

/** 供 UI 提示：音频与当前选择的时长差多少 */
export const describeDurationFit = (
  audioSeconds: number,
  currentSeconds: number,
): { status: "empty" | "fit" | "short" | "longer" | "too-long"; message: string } => {
  if (!Number.isFinite(audioSeconds) || audioSeconds <= 0) {
    return { status: "empty", message: "还没有生成配音。" };
  }
  if (audioSeconds > 15) {
    return {
      status: "too-long",
      message: `配音 ${audioSeconds.toFixed(1)} 秒，超过单段 15 秒上限：请缩短讲稿、适当提高语速后重新生成，或拆成多个镜头。`,
    };
  }
  const suggested = resolveDurationFromAudio(audioSeconds) ?? currentSeconds;
  if (Math.abs(suggested - currentSeconds) < 0.26) {
    return { status: "fit", message: `配音 ${audioSeconds.toFixed(1)} 秒，与当前时长匹配。` };
  }
  if (suggested > currentSeconds) {
    return {
      status: "longer",
      message: `配音 ${audioSeconds.toFixed(1)} 秒，比当前 ${currentSeconds.toFixed(1)} 秒长，建议延长到 ${suggested.toFixed(1)} 秒，避免结尾被截断。`,
    };
  }
  return {
    status: "short",
    message: `配音 ${audioSeconds.toFixed(1)} 秒，画面会多保留 ${(currentSeconds - audioSeconds).toFixed(1)} 秒。`,
  };
};

export const sanitizeNarration = (raw: unknown, fps: number, fallbackScript: string): NarrationProps => {
  const source = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const readString = (value: unknown): string | null =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : null;

  const script =
    typeof source.script === "string" && source.script.trim().length > 0
      ? source.script.trim().slice(0, NARRATION_LIMITS.scriptMaxLength)
      : fallbackScript.slice(0, NARRATION_LIMITS.scriptMaxLength);

  const speed =
    typeof source.speed === "number" && Number.isFinite(source.speed) ? clampSpeed(source.speed) : 1;
  const volume =
    typeof source.volume === "number" && Number.isFinite(source.volume) ? clampVolume(source.volume) : 0.9;
  const audioDurationSeconds =
    typeof source.audioDurationSeconds === "number" && Number.isFinite(source.audioDurationSeconds)
      ? Math.max(0, source.audioDurationSeconds)
      : 0;

  const provider = source.provider;
  const providerId: TtsProviderId | null =
    provider === "local" || provider === "openai" || provider === "azure" ? provider : null;

  return {
    enabled: source.enabled === true,
    ttsId: readString(source.ttsId),
    audioSrc: readString(source.audioSrc),
    script,
    voiceId: readString(source.voiceId),
    voiceName: readString(source.voiceName),
    provider: providerId,
    speed,
    volume,
    audioDurationSeconds,
  };
};

/** 由文案拼出默认讲解稿（每段换行，方便朗读与断句） */
export const buildScriptFromLines = (title: string, lines: string[]): string => {
  const strip = (value: string) => value.replace(/[，,、；;：:。.!！?？\s]+$/u, "").trim();
  const parts = [title, ...lines].map(strip).filter((part) => part.length > 0);
  return `${parts.join("。")}。`.slice(0, NARRATION_LIMITS.scriptMaxLength);
};

export const narrationFpsGuard = (fps: number): number => (Number.isFinite(fps) && fps > 0 ? fps : 30);