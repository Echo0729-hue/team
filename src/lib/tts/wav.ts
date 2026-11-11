/** 极简 WAV 读写：解析 PCM、拼接、生成静音，用于把逐句配音合成一条音轨。 */

export type PcmWav = {
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  data: Buffer;
};

const RIFF = "RIFF";
const WAVE = "WAVE";

export const parseWav = (buffer: Buffer): PcmWav => {
  if (buffer.length < 12 || buffer.toString("ascii", 0, 4) !== RIFF || buffer.toString("ascii", 8, 12) !== WAVE) {
    throw new Error("配音文件不是合法的 WAV。");
  }

  let offset = 12;
  let sampleRate = 24000;
  let channels = 1;
  let bitsPerSample = 16;
  let data: Buffer | null = null;

  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (id === "fmt ") {
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bitsPerSample = buffer.readUInt16LE(body + 14);
    } else if (id === "data") {
      data = buffer.subarray(body, Math.min(buffer.length, body + size));
    }

    offset = body + size + (size % 2);
  }

  if (!data || data.length === 0) {
    throw new Error("配音文件缺少音频数据。");
  }

  return { sampleRate, channels, bitsPerSample, data };
};

export const encodeWav = (wav: PcmWav): Buffer => {
  const byteRate = (wav.sampleRate * wav.channels * wav.bitsPerSample) / 8;
  const blockAlign = (wav.channels * wav.bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write(RIFF, 0);
  header.writeUInt32LE(36 + wav.data.length, 4);
  header.write(WAVE, 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(wav.channels, 22);
  header.writeUInt32LE(wav.sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(wav.bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(wav.data.length, 40);

  return Buffer.concat([header, wav.data]);
};

export const pcmDurationSeconds = (wav: PcmWav): number => {
  const bytesPerSample = wav.bitsPerSample / 8;
  const frameBytes = Math.max(1, wav.channels * bytesPerSample);
  const frames = wav.data.length / frameBytes;
  return frames / wav.sampleRate;
};

export const silenceBuffer = (seconds: number, wav: Pick<PcmWav, "sampleRate" | "channels" | "bitsPerSample">): Buffer => {
  const frameBytes = (wav.channels * wav.bitsPerSample) / 8;
  const bytes = Math.max(0, Math.round(seconds * wav.sampleRate) * frameBytes);
  return Buffer.alloc(bytes);
};
/**
 * 峰值归一化：把整体电平提到接近 -1 dBFS，避免配音过轻或过响。
 * 只处理 16bit PCM，增益上限默认 4 倍，防止把底噪放大。
 */
export const normalizePcm16 = (data: Buffer, targetPeak = 0.89, maxGain = 4): Buffer => {
  let peak = 0;
  for (let offset = 0; offset + 1 < data.length; offset += 2) {
    const value = Math.abs(data.readInt16LE(offset));
    if (value > peak) {
      peak = value;
    }
  }
  const target = Math.round(targetPeak * 32767);
  if (peak === 0) {
    return data;
  }
  const gain = Math.min(maxGain, target / peak);
  if (gain <= 1.02) {
    return data;
  }
  const output = Buffer.alloc(data.length);
  for (let offset = 0; offset + 1 < data.length; offset += 2) {
    const value = Math.round(data.readInt16LE(offset) * gain);
    output.writeInt16LE(Math.max(-32768, Math.min(32767, value)), offset);
  }
  return output;
};
