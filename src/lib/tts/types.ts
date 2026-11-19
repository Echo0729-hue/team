import type { NarrationScene, TtsProviderId } from "@/remotion/narration";
import type { PcmWav } from "./wav";

export type VoiceOption = {
  id: string;
  name: string;
  provider: TtsProviderId;
  lang: string;
  gender: string;
  description: string;
};

export type SynthesizeChunkOptions = {
  text: string;
  voiceId: string;
  speed: number;
};

export type TtsProvider = {
  id: TtsProviderId;
  label: string;
  /** 是否具备可用的配置（密钥 / 本机语音） */
  isAvailable: () => Promise<boolean>;
  listVoices: () => Promise<VoiceOption[]>;
  synthesizeChunk: (options: SynthesizeChunkOptions) => Promise<PcmWav>;
};

export type TtsCue = {
  text: string;
  lines: string[];
  startSeconds: number;
  endSeconds: number;
  startFrame: number;
  endFrame: number;
  sceneId?: NarrationScene["id"];
};

export type TtsRecord = {
  id: string;
  provider: TtsProviderId;
  voiceId: string;
  voiceName: string;
  speed: number;
  script: string;
  fileName: string;
  durationSeconds: number;
  sampleRate: number;
  cues: TtsCue[];
  chunkCount: number;
  createdAt: string;
  scenes?: NarrationScene[];
  contentKey?: string;
};

export type TtsResult = Pick<TtsRecord, "id" | "durationSeconds" | "voiceId" | "voiceName" | "provider" | "speed" | "script" | "cues" | "chunkCount" | "scenes" | "contentKey"> & {
  audioUrl: string;
  srtUrl: string;
};

export type TtsConfig = {
  provider: TtsProviderId | null;
  providerLabel: string;
  configured: boolean;
  /** 给界面的说明（未配置时讲清楚需要设哪些环境变量） */
  message: string;
};
