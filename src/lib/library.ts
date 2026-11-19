import fs from "node:fs";
import path from "node:path";
import { isRatioId, isTemplateId, type RatioId, type TemplateId } from "@/remotion/params";
import { resolveInside } from "./filePaths";
import {
  buildUniqueVideoName,
  sanitizeVideoName,
  toDownloadFileName,
} from "./videoName";

/** 素材库：把每次成功导出的视频记录到 output/library.json，刷新/重启后仍可找回。 */

export const OUTPUT_DIR = path.join(process.cwd(), "output");
const LIBRARY_FILE = path.join(OUTPUT_DIR, "library.json");

export type LibraryItem = {
  id: string;
  /** 用户可编辑的视频名称（下载文件名、素材列表、合并列表都用它） */
  name: string;
  /** 生成时的内容标题，仅作参考 */
  title: string;
  fileName: string;
  width: number;
  height: number;
  durationInSeconds: number;
  durationInFrames: number;
  template: TemplateId;
  ratio: RatioId;
  kind: "single" | "merge";
  segmentCount: number;
  /** 是否带配音（合并成片来自源片音轨） */
  hasNarration: boolean;
  /** 是否把字幕烙进了画面 */
  hasSubtitles: boolean;
  fileSize: number;
  createdAt: string;
};

type LibraryFile = {
  items: LibraryItem[];
};

/** 旧数据没有 name 字段时用 title 迁移 */
const normalizeItem = (item: LibraryItem): LibraryItem => ({
  ...item,
  name: sanitizeVideoName(item.name ?? item.title, item.title),
  hasNarration: item.hasNarration === true,
  hasSubtitles: item.hasSubtitles === true,
});

const readFile = (): LibraryFile => {
  try {
    const raw = fs.readFileSync(LIBRARY_FILE, "utf8");
    const parsed = JSON.parse(raw) as LibraryFile;
    if (Array.isArray(parsed?.items) && parsed.items.every((item) => item &&
      typeof item.id === "string" && typeof item.title === "string" && typeof item.fileName === "string" &&
      typeof item.createdAt === "string" && isRatioId(item.ratio) && isTemplateId(item.template) &&
      Number.isInteger(item.durationInFrames) && item.durationInFrames > 0 &&
      Number.isFinite(item.durationInSeconds) && item.durationInSeconds > 0 &&
      resolveInside(OUTPUT_DIR, item.fileName))) {
      return { items: parsed.items.map(normalizeItem) };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { items: [] };
    throw new Error("素材库记录读取失败，原文件已保留；请检查 output/library.json 或从备份恢复。");
  }
  throw new Error("素材库记录格式不正确，原文件已保留；请从备份恢复。");
};

const writeFile = (data: LibraryFile): void => {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const temp = `${LIBRARY_FILE}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(temp, LIBRARY_FILE);
};

export const listLibrary = (): LibraryItem[] => {
  const { items } = readFile();
  return items
    .filter((item) => fs.existsSync(path.join(OUTPUT_DIR, item.fileName)))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
};

export const getLibraryItem = (id: string): LibraryItem | undefined => {
  const item = readFile().items.find((entry) => entry.id === id);
  if (!item) {
    return undefined;
  }
  return fs.existsSync(path.join(OUTPUT_DIR, item.fileName)) ? item : undefined;
};

/** 新增素材；名称重复时自动加序号，避免下载文件名互相覆盖 */
export const addLibraryItem = (item: LibraryItem): LibraryItem => {
  const data = readFile();
  const others = data.items.filter((entry) => entry.id !== item.id);
  const name = buildUniqueVideoName(
    item.name,
    others.map((entry) => entry.name),
  );
  const next: LibraryItem = { ...item, name };
  writeFile({ items: [next, ...others] });
  return next;
};

/** 重命名素材；返回更新后的记录，记录不存在时返回 undefined */
export const renameLibraryItem = (id: string, desiredName: string): LibraryItem | undefined => {
  const data = readFile();
  const item = data.items.find((entry) => entry.id === id);
  if (!item) {
    return undefined;
  }

  const name = buildUniqueVideoName(
    desiredName,
    data.items.filter((entry) => entry.id !== id).map((entry) => entry.name),
  );
  const next: LibraryItem = { ...item, name };
  writeFile({ items: data.items.map((entry) => (entry.id === id ? next : entry)) });
  return next;
};

/** 只移除素材记录（文件删除由 API 负责校验路径后执行） */
export const removeLibraryItem = (id: string): LibraryItem | undefined => {
  const data = readFile();
  const item = data.items.find((entry) => entry.id === id);
  if (!item) {
    return undefined;
  }
  writeFile({ items: data.items.filter((entry) => entry.id !== id) });
  return item;
};

/** 素材文件名解析成绝对路径，并限制在 output/ 内 */
export const resolveLibraryFilePath = (fileName: string): string => {
  return resolveInside(OUTPUT_DIR, fileName);
};

export const toPublicLibraryItem = (item: LibraryItem) => ({
  id: item.id,
  name: item.name,
  title: item.title,
  fileName: item.fileName,
  width: item.width,
  height: item.height,
  durationInSeconds: item.durationInSeconds,
  durationInFrames: item.durationInFrames,
  ratio: item.ratio,
  template: item.template,
  kind: item.kind,
  segmentCount: item.segmentCount,
  hasNarration: item.hasNarration,
  hasSubtitles: item.hasSubtitles,
  fileSize: item.fileSize,
  createdAt: item.createdAt,
  downloadFileName: toDownloadFileName(item.name),
  videoUrl: `/api/videos/${item.id}`,
  downloadUrl: `/api/videos/${item.id}?download=1`,
});

export type PublicLibraryItem = ReturnType<typeof toPublicLibraryItem>;
