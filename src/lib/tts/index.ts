import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { azureProvider } from "./azure";
import { localProvider } from "./local";
import { openaiProvider } from "./openai";
import { cueLines, splitScriptIntoCues, TTS_CUE_MAX_CHARS } from "./split";
import type { SynthesizeChunkOptions, TtsConfig, TtsCue, TtsProvider, TtsRecord, VoiceOption } from "./types";
import type { TtsProviderId } from "@/remotion/narration";
import { NARRATION_LIMITS, NARRATION_SCENE_IDS, narrationContentKey, normalizeScript, parseNarrationScenes, type NarrationContent } from "@/remotion/narration";
import { encodeWav, normalizePcm16, pcmDurationSeconds, silenceBuffer, type PcmWav } from "./wav";

export const TTS_DIR = path.join(process.cwd(), "output", "tts");
const GAP_SECONDS = 0.18;
const FPS = 30;

const PROVIDERS: Record<TtsProviderId, TtsProvider> = {
  azure: azureProvider,
  openai: openaiProvider,
  local: localProvider,
};

const isProviderId = (value: unknown): value is TtsProviderId =>
  value === "azure" || value === "openai" || value === "local";

const recordPath = (id: string): string => path.join(TTS_DIR, `${id}.json`);
const audioPath = (id: string): string => path.join(TTS_DIR, `${id}.wav`);

/** 当前可用的配音服务：环境变量优先，其次本机 Windows 语音 */
export const getTtsConfig = async (): Promise<TtsConfig> => {
  const requested = (process.env.TTS_PROVIDER ?? "").trim().toLowerCase();
  // 默认顺序：本机中文语音（离线、已实网验证）→ Azure → OpenAI 兼容
  // 想强制用云端可设置 TTS_PROVIDER=azure|openai
  const order: TtsProviderId[] = isProviderId(requested)
    ? [requested]
    : ["local", "azure", "openai"];

  for (const id of order) {
    const provider = PROVIDERS[id];
    try {
      if (await provider.isAvailable()) {
        return {
          provider: id,
          providerLabel: provider.label,
          configured: true,
          message:
            id === "local"
              ? "默认使用 Windows 本机中文语音（离线可用）；音色列表里也可选云端音色。"
              : `默认使用 ${provider.label}；音色列表里可选其它可用音色。`,
        };
      }
    } catch {
      // 探测失败视为不可用，继续尝试下一个
    }
  }

  return {
    provider: null,
    providerLabel: "",
    configured: false,
    message:
      "配音服务未配置：请设置 TTS_API_KEY（OpenAI 兼容接口）或 AZURE_SPEECH_KEY + AZURE_SPEECH_REGION，也可以安装 Windows 中文语音包使用本机合成。",
  };
};

export const listTtsVoices = async (): Promise<{
  config: TtsConfig;
  voices: VoiceOption[];
  providers: { id: TtsProviderId; label: string; available: boolean }[];
}> => {
  const config = await getTtsConfig();
  const providers: { id: TtsProviderId; label: string; available: boolean }[] = [];
  const voices: VoiceOption[] = [];

  for (const id of ["local", "azure", "openai"] as TtsProviderId[]) {
    const provider = PROVIDERS[id];
    let available = false;
    try {
      available = await provider.isAvailable();
    } catch {
      available = false;
    }
    providers.push({ id, label: provider.label, available });
    if (available) {
      voices.push(...(await provider.listVoices()));
    }
  }

  return { config, voices, providers };
};

/** 从音色 id 前缀判断使用哪个服务（local: / openai: / azure:） */
const providerFromVoice = (voiceId: string): TtsProviderId | null => {
  const prefix = voiceId.split(":")[0];
  return isProviderId(prefix) ? prefix : null;
};

export const getTtsRecord = (id: string): TtsRecord | null => {
  if (!/^[a-f\d]{20}$/.test(id)) return null;
  try {
    const raw = fs.readFileSync(recordPath(id), "utf8");
    const record = JSON.parse(raw) as TtsRecord;
    if (!record || record.id !== id || typeof record.script !== "string" || typeof record.voiceId !== "string" ||
      !Number.isFinite(record.durationSeconds) || record.durationSeconds <= 0 ||
      !Number.isFinite(record.speed) || !Array.isArray(record.cues) ||
      record.cues.some((cue) => !cue || typeof cue.text !== "string" || !Array.isArray(cue.lines) ||
        !Number.isInteger(cue.startFrame) || !Number.isInteger(cue.endFrame) || cue.endFrame <= cue.startFrame)) return null;
    if (!fs.existsSync(audioPath(id))) {
      return null;
    }
    return record;
  } catch {
    return null;
  }
};

export const getTtsAudioPath = (id: string): string | null => {
  if (!/^[a-f\d]{20}$/.test(id)) return null;
  const file = audioPath(id);
  return fs.existsSync(file) ? file : null;
};

/** 浏览器/渲染使用的音频相对地址（渲染时会被替换为 bundle 服务的绝对地址） */
export const ttsAudioUrl = (id: string): string => `/api/tts/${id}/audio`;

export type SynthesizeInput = {
  script: string;
  voiceId: string;
  speed: number;
  content?: NarrationContent;
};

export type SynthesizeResult = TtsRecord;

const buildId = (provider: TtsProviderId, voiceId: string, speed: number, script: string): string =>
  crypto.createHash("sha1").update(`${provider}|${voiceId}|${speed.toFixed(2)}|${script}`).digest("hex").slice(0, 20);

/**
 * 逐句合成 → 拼接成一条音轨 → 用每句真实音频长度建立字幕时间轴。
 * 同一份文本 + 音色 + 语速会复用同一个文件，保证试听 / 预览 / 导出完全一致。
 */
export const synthesizeNarration = async (input: SynthesizeInput): Promise<SynthesizeResult> => {
  const script = normalizeScript(input.script);
  if (script.length === 0) {
    throw new Error("讲解稿不能为空。");
  }
  if (Array.from(script).length > NARRATION_LIMITS.scriptMaxLength) {
    throw new Error(`讲解稿最多 ${NARRATION_LIMITS.scriptMaxLength} 字。`);
  }

  const config = await getTtsConfig();
  const wanted = providerFromVoice(input.voiceId);
  if (wanted && !(await PROVIDERS[wanted].isAvailable())) {
    throw new Error(`所选音色所属的「${PROVIDERS[wanted].label}」未配置或不可用。`);
  }
  const providerId = wanted ?? config.provider;
  if (!providerId) {
    throw new Error(config.message);
  }

  const provider = PROVIDERS[providerId];
  const voices = await provider.listVoices();
  const voice = input.voiceId ? voices.find((item) => item.id === input.voiceId) : voices[0];
  if (!voice) {
    if (input.voiceId) throw new Error("所选音色已不可用，请刷新音色列表并重新选择。");
    throw new Error("没有可用的中文音色，请先安装语音包或配置云端服务。");
  }

  const speed = Math.min(
    NARRATION_LIMITS.speedMax,
    Math.max(NARRATION_LIMITS.speedMin, Math.round(input.speed * 100) / 100),
  );

  const sceneTexts = input.content ? parseNarrationScenes(script) : null;
  if (input.content && !sceneTexts) {
    throw new Error("讲解稿请分成四段，依次对应标题、第一段、第二段和第三段，每段另起一行。");
  }
  const contentKey = input.content ? narrationContentKey(input.content) : undefined;
  // Older audio merged short sentences across scene boundaries.
  const id = buildId(provider.id, voice.id, speed, `scenes-v2|${contentKey ?? ""}|${script}`);
  const cached = getTtsRecord(id);
  if (cached) {
    return cached;
  }

  const pieces = sceneTexts
    ? sceneTexts.flatMap((text, index) => splitScriptIntoCues(text).map((piece) => ({ text: piece, sceneId: NARRATION_SCENE_IDS[index] })))
    : splitScriptIntoCues(script).map((text) => ({ text, sceneId: undefined }));
  if (pieces.length === 0) {
    throw new Error("讲稿里没有可朗读的文字。");
  }

  await fs.promises.mkdir(TTS_DIR, { recursive: true });

  const chunks: PcmWav[] = [];
  for (const [index, piece] of pieces.entries()) {
    try {
      const options: SynthesizeChunkOptions = { text: piece.text, voiceId: voice.id, speed };
      chunks.push(await provider.synthesizeChunk(options));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`第 ${index + 1} 句配音失败：${reason}`);
    }
  }

  const first = chunks[0];
  const mixed = chunks.some(
    (chunk) =>
      chunk.sampleRate !== first.sampleRate ||
      chunk.channels !== first.channels ||
      chunk.bitsPerSample !== first.bitsPerSample,
  );
  if (mixed) {
    throw new Error("语音服务返回的音频格式不一致，无法拼接。");
  }

  const dataParts: Buffer[] = [];
  const cues: TtsCue[] = [];
  let cursor = 0;

  chunks.forEach((chunk, index) => {
    const duration = pcmDurationSeconds(chunk);
    const start = cursor;
    const end = start + duration;
    cues.push({
      text: pieces[index].text,
      lines: cueLines(pieces[index].text),
      sceneId: pieces[index].sceneId,
      startSeconds: Number(start.toFixed(3)),
      endSeconds: Number(end.toFixed(3)),
      startFrame: Math.round(start * FPS),
      endFrame: Math.round(end * FPS),
    });
    dataParts.push(chunk.data);
    cursor = end;
    if (index < chunks.length - 1) {
      dataParts.push(silenceBuffer(GAP_SECONDS, chunk));
      cursor += GAP_SECONDS;
    }
  });

  const rawData = Buffer.concat(dataParts);
  const data = first.bitsPerSample === 16 ? normalizePcm16(rawData) : rawData;
  const audio = encodeWav({
    sampleRate: first.sampleRate,
    channels: first.channels,
    bitsPerSample: first.bitsPerSample,
    data,
  });

  const durationSeconds = Number((data.length / (first.channels * (first.bitsPerSample / 8) * first.sampleRate)).toFixed(3));

  const record: TtsRecord = {
    id,
    provider: provider.id,
    voiceId: voice.id,
    voiceName: voice.name,
    speed,
    script,
    fileName: `${id}.wav`,
    durationSeconds,
    sampleRate: first.sampleRate,
    chunkCount: chunks.length,
    createdAt: new Date().toISOString(),
    contentKey,
    scenes: sceneTexts?.map((text, index) => {
      const matching = cues.filter((cue) => cue.sceneId === NARRATION_SCENE_IDS[index]);
      return { id: NARRATION_SCENE_IDS[index], text, startFrame: matching[0].startFrame, endFrame: matching[matching.length - 1].endFrame };
    }),
    cues: cues.map((cue, index) => ({
      ...cue,
      // 最后一句不留尾部静音；其余 cue 之间用间隙衔接
      endFrame: index === cues.length - 1 ? Math.round(durationSeconds * FPS) : cue.endFrame,
      endSeconds: index === cues.length - 1 ? durationSeconds : cue.endSeconds,
    })),
  };

  await fs.promises.writeFile(audioPath(id), audio);
  await fs.promises.writeFile(recordPath(id), JSON.stringify(record, null, 2), "utf8");

  return record;
};

/** 讲稿被截断/过长时的提示阈值，供 API 返回 */
export const TTS_LIMITS = {
  maxScriptChars: NARRATION_LIMITS.scriptMaxLength,
  maxCueChars: TTS_CUE_MAX_CHARS,
} as const;
