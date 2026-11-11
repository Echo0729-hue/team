/** 视频名称规则：去掉 Windows 非法字符、限制 60 字、重名自动加序号。 */

export const VIDEO_NAME_MAX_LENGTH = 60;
export const FALLBACK_VIDEO_NAME = "未命名视频";

/** Windows 文件名非法字符：\ / : * ? " < > | 以及控制字符 */
const ILLEGAL_CHARS = /[\\/:*?"<>|\u0000-\u001f]/g;

export const hasIllegalNameChars = (value: string): boolean => {
  ILLEGAL_CHARS.lastIndex = 0;
  return ILLEGAL_CHARS.test(value);
};

export const stripIllegalNameChars = (value: string): string =>
  value.replace(ILLEGAL_CHARS, " ").replace(/\s+/g, " ").replace(/^[\s.]+/, "").replace(/[\s.]+$/, "");

export const truncateVideoName = (value: string): string =>
  Array.from(value).slice(0, VIDEO_NAME_MAX_LENGTH).join("");

/**
 * 生成可安全落盘的名称：非法字符换成空格、压缩空白、去掉首尾空白与点号、
 * 截断到 60 字；全部被清理掉时使用兜底名称。
 */
export const sanitizeVideoName = (raw: unknown, fallback = FALLBACK_VIDEO_NAME): string => {
  const source = typeof raw === "string" ? raw : "";
  const cleaned = truncateVideoName(stripIllegalNameChars(source));
  if (cleaned.trim().length > 0) {
    return cleaned;
  }
  const fallbackName = truncateVideoName(stripIllegalNameChars(fallback));
  return fallbackName.trim().length > 0 ? fallbackName : FALLBACK_VIDEO_NAME;
};

/**
 * 重名时追加序号：`名称` → `名称 (2)` → `名称 (3)`…
 * 比较时忽略大小写，确保下载文件名不会互相覆盖。
 */
export const buildUniqueVideoName = (
  desired: string,
  existing: readonly string[],
  ignoreName?: string,
): string => {
  const base = sanitizeVideoName(desired);
  const taken = new Set(
    existing
      .filter((name) => (ignoreName ? name !== ignoreName : true))
      .map((name) => name.toLowerCase()),
  );

  if (!taken.has(base.toLowerCase())) {
    return base;
  }

  for (let index = 2; index < 1000; index += 1) {
    const suffix = ` (${index})`;
    const head = truncateVideoName(base.slice(0, Math.max(1, VIDEO_NAME_MAX_LENGTH - suffix.length))).trimEnd();
    const candidate = `${head}${suffix}`;
    if (!taken.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `${truncateVideoName(base).trimEnd()} (${Date.now()})`;
};

/** 下载时使用的文件名（保留中文，去掉结尾多余点号） */
export const toDownloadFileName = (name: string): string =>
  `${sanitizeVideoName(name).replace(/\.+$/, "") || FALLBACK_VIDEO_NAME}.mp4`;