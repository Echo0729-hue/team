/** OpenAI 兼容的语音合成（/audio/speech）：密钥只留在服务端。 */
import { parseWav } from "./wav";
import type { SynthesizeChunkOptions, TtsProvider, VoiceOption } from "./types";

const OPENAI_VOICES: { id: string; name: string; gender: string }[] = [
  { id: "nova", name: "Nova（温柔女声）", gender: "Female" },
  { id: "shimmer", name: "Shimmer（柔和女声）", gender: "Female" },
  { id: "coral", name: "Coral（明亮女声）", gender: "Female" },
  { id: "sage", name: "Sage（沉稳女声）", gender: "Female" },
  { id: "alloy", name: "Alloy（中性）", gender: "Neutral" },
  { id: "echo", name: "Echo（男声）", gender: "Male" },
  { id: "onyx", name: "Onyx（低沉男声）", gender: "Male" },
  { id: "fable", name: "Fable（叙事男声）", gender: "Male" },
  { id: "ash", name: "Ash（干净男声）", gender: "Male" },
  { id: "verse", name: "Verse（讲述男声）", gender: "Male" },
  { id: "marin", name: "Marin（自然女声）", gender: "Female" },
  { id: "cedar", name: "Cedar（自然男声）", gender: "Male" },
];

const getApiKey = (): string | null => {
  const key = process.env.TTS_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  return key.trim().length > 0 ? key.trim() : null;
};

const getBaseUrl = (): string =>
  (
    process.env.TTS_BASE_URL ??
    process.env.OPENAI_BASE_URL ??
    process.env.OPENAI_API_BASE ??
    "https://api.openai.com/v1"
  ).replace(/\/+$/, "");

const getModel = (): string => process.env.TTS_MODEL ?? "gpt-4o-mini-tts";

const listVoices = async (): Promise<VoiceOption[]> => {
  if (!getApiKey()) {
    return [];
  }

  const override = (process.env.TTS_VOICES ?? "").split(",").map((item) => item.trim()).filter(Boolean);
  const pool = override.length > 0
    ? OPENAI_VOICES.filter((voice) => override.includes(voice.id))
    : OPENAI_VOICES;

  return pool.map((voice) => ({
    id: `openai:${voice.id}`,
    name: voice.name,
    provider: "openai" as const,
    lang: "zh-CN",
    gender: voice.gender,
    description: "云端语音（OpenAI 兼容接口）",
  }));
};

let probe: { value: boolean; at: number } | null = null;

/** 有密钥还不够：探测一次网关是否可达，避免把连不上的云端当成默认音色 */
const probeGateway = async (): Promise<boolean> => {
  const key = getApiKey();
  if (!key) {
    return false;
  }
  if (process.env.TTS_SKIP_PROBE === "1") {
    return true;
  }
  if (probe && Date.now() - probe.at < 60_000) {
    return probe.value;
  }
  try {
    const response = await fetch(`${getBaseUrl()}/models`, {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(2500),
    });
    probe = { value: response.ok, at: Date.now() };
  } catch {
    probe = { value: false, at: Date.now() };
  }
  return probe.value;
};

const synthesizeChunk = async ({ text, voiceId, speed }: SynthesizeChunkOptions) => {
  const key = getApiKey();
  if (!key) {
    throw new Error("未配置 TTS_API_KEY / OPENAI_API_KEY。");
  }

  const voice = voiceId.replace(/^openai:/, "");
  const response = await fetch(`${getBaseUrl()}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model: getModel(),
      voice,
      input: text,
      response_format: "wav",
      speed: Math.min(4, Math.max(0.25, speed)),
    }),
    signal: AbortSignal.timeout(45_000),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`语音服务返回 ${response.status}${detail ? `：${detail.slice(0, 200)}` : ""}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  return parseWav(buffer);
};

export const openaiProvider: TtsProvider = {
  id: "openai",
  label: "OpenAI 兼容语音服务",
  isAvailable: probeGateway,
  listVoices,
  synthesizeChunk,
};