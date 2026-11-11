import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { PcmWav } from "./wav";
import { parseWav, silenceBuffer, encodeWav } from "./wav";
import type { SynthesizeChunkOptions, TtsProvider, VoiceOption } from "./types";

const execFileAsync = promisify(execFile);

const TTS_DIR = path.join(process.cwd(), "output", "tts");
const SCRIPT_PATH = path.join(TTS_DIR, "sapi-synth.ps1");

const SYNTH_SCRIPT = `param([string]$TextFile, [string]$OutFile, [string]$VoiceName, [int]$Rate)
Add-Type -AssemblyName System.Speech
$text = [System.IO.File]::ReadAllText($TextFile, [System.Text.Encoding]::UTF8)
if ([string]::IsNullOrWhiteSpace($text)) { throw "empty text" }
$s = New-Object System.Speech.Synthesis.SpeechSynthesizer
$fmt = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo(24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
try {
  if ($VoiceName) { $s.SelectVoice($VoiceName) }
  $s.Rate = [Math]::Max(-10, [Math]::Min(10, $Rate))
  $s.SetOutputToWaveFile($OutFile, $fmt)
  $s.Speak($text)
} finally {
  $s.Dispose()
}
`;

const ensureScript = async (): Promise<string> => {
  await fs.promises.mkdir(TTS_DIR, { recursive: true });
  try {
    await fs.promises.access(SCRIPT_PATH);
  } catch {
    await fs.promises.writeFile(SCRIPT_PATH, SYNTH_SCRIPT, "utf8");
  }
  return SCRIPT_PATH;
};

const runPowerShell = async (args: string[]): Promise<string> => {
  const { stdout } = await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", ...args],
    { windowsHide: true, timeout: 60_000, maxBuffer: 4 * 1024 * 1024 },
  );
  return stdout;
};

const SUPPORTED = process.platform === "win32";

let voiceCache: VoiceOption[] | null = null;

const listVoices = async (): Promise<VoiceOption[]> => {
  if (!SUPPORTED) {
    return [];
  }
  if (voiceCache) {
    return voiceCache;
  }

  const script = [
    "Add-Type -AssemblyName System.Speech",
    "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
    "$s.GetInstalledVoices() | ForEach-Object { if ($_.Enabled) { [pscustomobject]@{ Name=$_.VoiceInfo.Name; Culture=$_.VoiceInfo.Culture.Name; Gender=$_.VoiceInfo.Gender.ToString() } } } | ConvertTo-Json -Compress",
    "$s.Dispose()",
  ].join("; ");

  let raw = "";
  try {
    raw = await runPowerShell(["-Command", script]);
  } catch {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim() || "[]");
  } catch {
    return [];
  }

  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const voices: VoiceOption[] = [];

  for (const entry of entries) {
    if (typeof entry !== "object" || entry === null) {
      continue;
    }
    const item = entry as { Name?: unknown; Culture?: unknown; Gender?: unknown };
    const name = typeof item.Name === "string" ? item.Name : "";
    const culture = typeof item.Culture === "string" ? item.Culture : "";
    if (!name || !culture.toLowerCase().startsWith("zh")) {
      continue;
    }
    const gender = typeof item.Gender === "string" ? item.Gender : "";
    voices.push({
      id: `local:${name}`,
      name: `${name.replace("Microsoft ", "").replace(" Desktop", "")}（本机）`,
      provider: "local",
      lang: culture,
      gender,
      description: "Windows 本机语音（离线可用，无需密钥）",
    });
  }

  voiceCache = voices;
  return voices;
};

/** 语速倍率 → SAPI 的 -10~10 档 */
const toSapiRate = (speed: number): number => Math.round(Math.max(-10, Math.min(10, (speed - 1) * 10)));

const synthesizeChunk = async ({ text, voiceId, speed }: SynthesizeChunkOptions): Promise<PcmWav> => {
  if (!SUPPORTED) {
    throw new Error("当前系统不支持本机语音合成，请配置云端 TTS 服务。");
  }

  const scriptPath = await ensureScript();
  const voiceName = voiceId.startsWith("local:") ? voiceId.slice("local:".length) : voiceId;
  const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "tts-"));
  const textPath = path.join(tempDir, "text.txt");
  const wavPath = path.join(tempDir, "out.wav");

  try {
    await fs.promises.writeFile(textPath, text, "utf8");
    await runPowerShell([
      "-File",
      scriptPath,
      "-TextFile",
      textPath,
      "-OutFile",
      wavPath,
      "-VoiceName",
      voiceName,
      "-Rate",
      String(toSapiRate(speed)),
    ]);

    const buffer = await fs.promises.readFile(wavPath);
    const wav = parseWav(buffer);
    if (wav.data.length === 0) {
      throw new Error("本机语音没有返回音频数据。");
    }
    // 首尾各补 60ms 静音，避免逐句拼接时首尾被切
    const padded = encodeWav({
      ...wav,
      data: Buffer.concat([silenceBuffer(0.06, wav), wav.data, silenceBuffer(0.06, wav)]),
    });
    return parseWav(padded);
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
  }
};

export const localProvider: TtsProvider = {
  id: "local",
  label: "Windows 本机语音",
  isAvailable: async () => (await listVoices()).length > 0,
  listVoices,
  synthesizeChunk,
};