import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

/** 上传图片保存在 output/uploads，元数据写在同名 .json，导出时与预览读同一份文件。 */

export const UPLOAD_DIR = path.join(process.cwd(), "output", "uploads");

export const UPLOAD_LIMITS = {
  maxBytes: 10 * 1024 * 1024,
  maxFiles: 60,
} as const;

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const EXT_MIME: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export type UploadRecord = {
  id: string;
  name: string;
  fileName: string;
  mime: string;
  size: number;
  width: number;
  height: number;
  url: string;
  createdAt: string;
};

const metaPath = (id: string): string => path.join(UPLOAD_DIR, `${id}.json`);

export const getUploadUrl = (fileName: string): string => `/api/uploads/${fileName}`;

const readPngSize = (buffer: Buffer): { width: number; height: number } | null => {
  if (buffer.length < 24) {
    return null;
  }
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
};

const readJpegSize = (buffer: Buffer): { width: number; height: number } | null => {
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
};

const readWebpSize = (buffer: Buffer): { width: number; height: number } | null => {
  if (buffer.length < 30) {
    return null;
  }
  const format = buffer.toString("ascii", 12, 16);

  if (format === "VP8X") {
    const width = 1 + (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16));
    const height = 1 + (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16));
    return { width, height };
  }

  if (format === "VP8 ") {
    // 关键帧起始码 9d 01 2a 之后的 14 bit 宽高
    const start = 26;
    if (buffer.length < start + 4) {
      return null;
    }
    return {
      width: buffer.readUInt16LE(start) & 0x3fff,
      height: buffer.readUInt16LE(start + 2) & 0x3fff,
    };
  }

  if (format === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1,
    };
  }

  return null;
};

export const readImageSize = (buffer: Buffer, mime: string): { width: number; height: number } | null => {
  try {
    if (mime === "image/png") {
      return readPngSize(buffer);
    }
    if (mime === "image/jpeg") {
      return readJpegSize(buffer);
    }
    if (mime === "image/webp") {
      return readWebpSize(buffer);
    }
  } catch {
    return null;
  }
  return null;
};

const sniffMime = (buffer: Buffer): string | null => {
  if (buffer.length > 8 && buffer.readUInt32BE(0) === 0x89504e47) {
    return "image/png";
  }
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    return "image/jpeg";
  }
  if (buffer.length > 12 && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") {
    return "image/webp";
  }
  return null;
};

export type SaveUploadResult =
  | { ok: true; upload: UploadRecord }
  | { ok: false; status: number; message: string };

export const saveUpload = async (file: File): Promise<SaveUploadResult> => {
  if (!file) {
    return { ok: false, status: 400, message: "请选择要上传的图片。" };
  }

  if (file.size > UPLOAD_LIMITS.maxBytes) {
    return {
      ok: false,
      status: 413,
      message: `图片大小 ${(file.size / 1024 / 1024).toFixed(1)} MB，超过 10 MB 限制，请压缩后再上传。`,
    };
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffMime(buffer);
  const mime = sniffed ?? (MIME_EXT[file.type] ? file.type : null);

  if (!mime || !MIME_EXT[mime]) {
    return {
      ok: false,
      status: 415,
      message: "只支持 JPG / PNG / WebP 图片，请重新选择文件。",
    };
  }
  if (sniffed !== mime) {
    return { ok: false, status: 415, message: "文件内容与扩展名不一致，已拒绝上传。" };
  }

  const size = readImageSize(buffer, mime);
  if (!size || size.width <= 0 || size.height <= 0) {
    return { ok: false, status: 415, message: "无法读取图片尺寸，文件可能已损坏。" };
  }

  const existing = listUploads();
  if (existing.length >= UPLOAD_LIMITS.maxFiles) {
    return {
      ok: false,
      status: 429,
      message: `最多保留 ${UPLOAD_LIMITS.maxFiles} 张图片，请先删除不再使用的素材。`,
    };
  }

  const id = crypto.randomUUID();
  const ext = MIME_EXT[mime];
  const fileName = `${id}.${ext}`;
  const original = (file.name || `image.${ext}`).slice(0, 120);

  await fs.promises.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.promises.writeFile(path.join(UPLOAD_DIR, fileName), buffer);

  const record: UploadRecord = {
    id,
    name: original,
    fileName,
    mime,
    size: buffer.length,
    width: size.width,
    height: size.height,
    url: getUploadUrl(fileName),
    createdAt: new Date().toISOString(),
  };

  await fs.promises.writeFile(metaPath(id), JSON.stringify(record, null, 2), "utf8");
  return { ok: true, upload: record };
};

export const listUploads = (): UploadRecord[] => {
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(UPLOAD_DIR);
  } catch {
    return [];
  }

  const uploads: UploadRecord[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".json")) {
      continue;
    }
    try {
      const record = JSON.parse(fs.readFileSync(path.join(UPLOAD_DIR, entry), "utf8")) as UploadRecord;
      if (!record?.fileName) {
        continue;
      }
      if (!fs.existsSync(path.join(UPLOAD_DIR, record.fileName))) {
        continue;
      }
      uploads.push(record);
    } catch {
      // 忽略损坏的元数据
    }
  }

  return uploads.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

/** 解析上传文件路径，限制在 output/uploads 内 */
export const resolveUploadPath = (fileName: string): string => {
  const root = path.resolve(UPLOAD_DIR);
  const target = path.resolve(root, fileName);
  if (!target.startsWith(`${root}${path.sep}`)) {
    throw new Error("非法的图片路径，已拒绝访问。");
  }
  return target;
};

export const mimeForFile = (fileName: string): string =>
  EXT_MIME[path.extname(fileName).slice(1).toLowerCase()] ?? "application/octet-stream";