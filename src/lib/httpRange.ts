/** Single byte ranges used by browser playback and the render media server. */
export const parseByteRange = (header: string, size: number): { start: number; end: number } | null => {
  if (!Number.isSafeInteger(size) || size <= 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) return null;
  const startValue = Number(match[1]);
  const endValue = Number(match[2]);
  if ((match[1] && !Number.isSafeInteger(startValue)) || (match[2] && !Number.isSafeInteger(endValue))) return null;
  const start = match[1] ? startValue : Math.max(0, size - endValue);
  const end = !match[1] || !match[2] ? size - 1 : Math.min(endValue, size - 1);
  return start >= 0 && start < size && end >= start ? { start, end } : null;
};
