"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { createEditorDraft, decodeEditorDraft, DRAFT_KEY, encodeEditorDraft, type EditorDraft } from "@/lib/projectDraft";

export function useEditorDraft() {
  const [draft, setDraft] = useState<EditorDraft>(createEditorDraft);
  const [ready, setReady] = useState(false);
  const [storageMessage, setStorageMessage] = useState("正在读取草稿…");
  const [restoredTtsId, setRestoredTtsId] = useState<string | null>(null);
  const latest = useRef(draft);
  const canSave = useRef(false);
  latest.current = draft;

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const restored = decodeEditorDraft(raw);
        setRestoredTtsId(restored.ttsId);
        latest.current = restored;
        setDraft(restored);
        setStorageMessage("已恢复草稿 · 保存在当前浏览器");
      } else setStorageMessage("草稿自动保存在当前浏览器");
      canSave.current = true;
    } catch {
      // Keep unreadable data intact; do not replace it with defaults.
      setStorageMessage("草稿读取失败，原记录已保留；本次编辑暂未自动保存。");
    }
    setReady(true);
  }, []);

  const flush = useCallback(() => {
    if (!canSave.current) return;
    try {
      window.localStorage.setItem(DRAFT_KEY, encodeEditorDraft(latest.current));
      setStorageMessage("草稿已自动保存 · 当前浏览器");
    } catch {
      setStorageMessage("自动保存失败，请检查浏览器存储空间并保留当前页面。");
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(flush, 200);
    return () => window.clearTimeout(timer);
  }, [draft, ready, flush]);

  useEffect(() => {
    const onVisibility = () => { if (document.visibilityState === "hidden") flush(); };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [flush]);

  return { draft, setDraft, ready, storageMessage, restoredTtsId };
}

export function useDraftField<K extends keyof EditorDraft>(
  draft: EditorDraft, setDraft: Dispatch<SetStateAction<EditorDraft>>, key: K,
): [EditorDraft[K], Dispatch<SetStateAction<EditorDraft[K]>>] {
  const set = useCallback<Dispatch<SetStateAction<EditorDraft[K]>>>((value) => {
    setDraft((previous) => ({ ...previous, [key]: typeof value === "function" ? (value as (old: EditorDraft[K]) => EditorDraft[K])(previous[key]) : value }));
  }, [setDraft, key]);
  return [draft[key], set];
}
