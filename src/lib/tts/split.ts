/** 把讲解稿拆成「一句一屏」的片段：每段不超过两行，尽量在标点处断开。 */
import { SUBTITLE_LIMITS, wrapSubtitleText } from "@/remotion/subtitles";

export const TTS_CUE_MAX_CHARS = 34; // 两行 × 17 字左右
const MIN_CUE_CHARS = 8;

const SENTENCE_END = "。！？!?；;\n";
const CLAUSE_END = "，,、：:；;。！？!?…";

const stripTrailing = (text: string): string =>
  text
    .replace(/[，,、：:；;。\s]+$/u, "")
    .replace(/\s+/g, " ")
    .trim();

const splitToClauses = (sentence: string): string[] => {
  const clauses: string[] = [];
  let buffer = "";
  for (const char of Array.from(sentence)) {
    buffer += char;
    if (CLAUSE_END.includes(char)) {
      clauses.push(buffer);
      buffer = "";
    }
  }
  if (buffer.trim().length > 0) {
    clauses.push(buffer);
  }
  return clauses;
};

/**
 * 断句规则：
 * 1. 先按句末标点/换行断句；
 * 2. 单句过长时按逗号、顿号等再切，累积到接近两行长度就断开；
 * 3. 过短的句子与下一句合并，避免字幕闪一下就消失。
 */
export const splitScriptIntoCues = (script: string): string[] => {
  const normalized = script.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return [];
  }

  const sentences = normalized
    .split(new RegExp(`(?<=[${SENTENCE_END}])`))
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  const pieces: string[] = [];
  for (const sentence of sentences) {
    const prepared = stripTrailing(sentence);
    if (prepared.length === 0) {
      continue;
    }
    if (Array.from(prepared).length <= TTS_CUE_MAX_CHARS) {
      pieces.push(prepared);
      continue;
    }

    let current = "";
    for (const clause of splitToClauses(sentence)) {
      const candidate = `${current}${clause}`;
      if (current.length > 0 && Array.from(stripTrailing(candidate)).length > TTS_CUE_MAX_CHARS) {
        pieces.push(stripTrailing(current));
        current = clause;
      } else {
        current = candidate;
      }
    }
    if (stripTrailing(current).length > 0) {
      pieces.push(stripTrailing(current));
    }
  }

  // A clause can itself exceed the limit when the author omitted punctuation.
  const bounded = pieces.flatMap((piece) => {
    const chars = Array.from(piece);
    const chunks: string[] = [];
    for (let index = 0; index < chars.length; index += TTS_CUE_MAX_CHARS) {
      chunks.push(chars.slice(index, index + TTS_CUE_MAX_CHARS).join(""));
    }
    return chunks;
  });

  // 合并过短的片段
  const cues: string[] = [];
  for (const piece of bounded) {
    const last = cues[cues.length - 1];
    if (last && Array.from(last).length < MIN_CUE_CHARS) {
      const merged = `${last}，${piece}`;
      if (Array.from(merged).length <= TTS_CUE_MAX_CHARS) {
        cues[cues.length - 1] = merged;
        continue;
      }
    }
    cues.push(piece);
  }

  return cues
    .map((cue) => cue.trim())
    .filter((cue) => cue.length > 0)
    .slice(0, SUBTITLE_LIMITS.maxCues);
};

/** 字幕行（≤2 行，每行 ≤18 字） */
export const cueLines = (text: string): string[] =>
  wrapSubtitleText(text, SUBTITLE_LIMITS.lineMaxChars).slice(0, SUBTITLE_LIMITS.maxLinesPerCue);
