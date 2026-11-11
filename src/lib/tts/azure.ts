/** Azure 语音服务（REST）：中文神经音色，密钥仅在服务端读取。 */
import { parseWav } from "./wav";
import type { SynthesizeChunkOptions, TtsProvider, VoiceOption } from "./types";

const AZURE_VOICES: { id: string; name: string; gender: string; lang: string }[] = [
  { id: "zh-CN-XiaoxiaoNeural", name: "晓晓（女声，通用）", gender: "Female", lang: "zh-CN" },
  { id: "zh-CN-XiaoyiNeural", name: "晓伊（女声，年轻）", gender: "Female", lang: "zh-CN" },
  { id: "zh-CN-YunxiNeural", name: "云希（男声，年轻）", gender: "Male", lang: "zh-CN" },
  { id: "zh-CN-YunjianNeural", name: "云健（男声，解说）", gender: "Male", lang: "zh-CN" },
  { id: "zh-CN-YunyangNeural", name: "云扬（男声，新闻）", gender: "Male", lang: "zh-CN" },
  { id: "zh-CN-YunxiaNeural", name: "云夏（男声，少年）", gender: "Male", lang: "zh-CN" },
  { id: "zh-TW-HsiaoChenNeural", name: "曉臻（女声，台湾）", gender: "Female", lang: "zh-TW" },
  { id: "zh-HK-HiuMaanNeural", name: "曉曼（女声，粤语）", gender: "Female", lang: "zh-HK" },
];

const getKey = (): string | null => {
  const key = process.env.AZURE_SPEECH_KEY ?? "";
  return key.trim().length > 0 ? key.trim() : null;
};

const getRegion = (): string => (process.env.AZURE_SPEECH_REGION ?? "").trim();

const isAvailable = async (): Promise<boolean> => Boolean(getKey() && getRegion());

const listVoices = async (): Promise<VoiceOption[]> => {
  if (!(await isAvailable())) {
    return [];
  }
  return AZURE_VOICES.map((voice) => ({
    id: `azure:${voice.id}`,
    name: voice.name,
    provider: "azure" as const,
    lang: voice.lang,
    gender: voice.gender,
    description: "Azure 神经语音（云端）",
  }));
};

const escapeXml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const synthesizeChunk = async ({ text, voiceId, speed }: SynthesizeChunkOptions) => {
  const key = getKey();
  const region = getRegion();
  if (!key || !region) {
    throw new Error("未配置 AZURE_SPEECH_KEY / AZURE_SPEECH_REGION。");
  }

  const voice = voiceId.replace(/^azure:/, "");
  const ratePercent = Math.round((speed - 1) * 100);
  const rate = `${ratePercent >= 0 ? "+" : ""}${ratePercent}%`;

  const ssml = `<speak version="1.0" xml:lang="zh-CN"><voice name="${voice}"><prosody rate="${rate}">${escapeXml(text)}</prosody></voice></speak>`;

  const response = await fetch(`https://${region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Ocp-Apim-Subscription-Key": key,
      "Content-Type": "application/ssml+xml",
      "X-Microsoft-OutputFormat": "riff-24khz-16bit-mono-pcm",
      "User-Agent": "code-video-generator",
    },
    body: ssml,
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Azure 语音服务返回 ${response.status}${detail ? `：${detail.slice(0, 200)}` : ""}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return parseWav(buffer);
};

export const azureProvider: TtsProvider = {
  id: "azure",
  label: "Azure 中文神经语音",
  isAvailable,
  listVoices,
  synthesizeChunk,
};