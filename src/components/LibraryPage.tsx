"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import SiteHeader from "./SiteHeader";
import Toast from "./Toast";
import VideoLightbox from "./VideoLightbox";
import DownloadVideo from "./DownloadVideo";
import SpotlightCard from "./react-bits/SpotlightCard";
import AnimatedContent from "./react-bits/AnimatedContent";
import type { PublicLibraryItem } from "@/lib/library";
import type { WorkbenchView } from "./Workbench";

const SELECTION_KEY = "codevideo:merge:selection";

const formatClock = (seconds: number): string => {
  const total = Math.round(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const formatSize = (bytes: number): string => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : "—");

const icons = {
  play: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" />
    </svg>
  ),
  download: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v10m0 0-4-4m4 4 4-4M5 18h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  edit: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20h4l10-10-4-4L4 16v4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  ),
  trash: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 7h14M9 7V5h6v2M7 7l1 13h8l1-13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  add: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  search: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.7" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
};

type LibraryPageProps = {
  onNavigate: (view: WorkbenchView) => void;
  onOpenNav: () => void;
};

export default function LibraryPage({ onNavigate, onOpenNav }: LibraryPageProps) {
  const [items, setItems] = useState<PublicLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [playing, setPlaying] = useState<PublicLibraryItem | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [renameBusy, setRenameBusy] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<PublicLibraryItem | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as
        | { items?: PublicLibraryItem[]; message?: string }
        | null;
      if (!response.ok || !data?.items) {
        setError(data?.message ?? `读取素材失败（HTTP ${response.status}）。`);
        return;
      }
      setItems(data.items);
      setError(null);
    } catch {
      setError("无法连接服务，请确认开发服务器仍在运行。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!deleting) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !deleteBusy) {
        setDeleting(null);
        setDeleteError(null);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [deleting, deleteBusy]);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return items;
    }
    return items.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [items, query]);

  const addToMerge = useCallback(
    (id: string) => {
      try {
        const raw = window.localStorage.getItem(SELECTION_KEY);
        const parsed: unknown = raw ? JSON.parse(raw) : [];
        const ids = Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
        if (!ids.includes(id)) {
          ids.push(id);
        }
        window.localStorage.setItem(SELECTION_KEY, JSON.stringify(ids));
      } catch {
        // 忽略写入失败
      }
      onNavigate("merge");
    },
    [onNavigate],
  );

  const saveRename = useCallback(
    async (item: PublicLibraryItem) => {
      const desired = draft.trim();
      if (!desired) {
        setRenameError("名称不能为空。");
        return;
      }
      setRenameBusy(true);
      setRenameError(null);
      try {
        const response = await fetch(`/api/library/${item.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: desired }),
        });
        const data = (await response.json().catch(() => null)) as
          | { item?: PublicLibraryItem; message?: string }
          | null;
        if (!response.ok || !data?.item) {
          setRenameError(data?.message ?? `重命名失败（HTTP ${response.status}）。`);
          return;
        }
        const updated = data.item;
        setItems((previous) => previous.map((entry) => (entry.id === updated.id ? updated : entry)));
        setEditingId(null);
        setToast(`已重命名为「${updated.name}」`);
      } catch {
        setRenameError("无法连接服务，名称没有保存。");
      } finally {
        setRenameBusy(false);
      }
    },
    [draft],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleting) {
      return;
    }
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/library/${deleting.id}`, { method: "DELETE" });
      const data = (await response.json().catch(() => null)) as
        | { deleted?: boolean; message?: string }
        | null;
      if (!response.ok || !data?.deleted) {
        setDeleteError(data?.message ?? `删除失败（HTTP ${response.status}）。`);
        return;
      }
      setItems((previous) => previous.filter((entry) => entry.id !== deleting.id));
      try {
        const raw = JSON.parse(window.localStorage.getItem(SELECTION_KEY) ?? "[]");
        if (Array.isArray(raw)) window.localStorage.setItem(SELECTION_KEY, JSON.stringify(raw.filter((id) => id !== deleting.id)));
      } catch {}
      setToast(`已删除「${deleting.name}」`);
      setDeleting(null);
      void load();
    } catch {
      setDeleteError("无法连接服务，删除没有完成。");
    } finally {
      setDeleteBusy(false);
    }
  }, [deleting, load]);

  return (
    <>
      <SiteHeader
        view="library"
        projectName="素材库"
        onOpenNav={onOpenNav}
        status={
          <span className="status-pill neutral">
            <i aria-hidden="true" />
            {items.length} 个素材
          </span>
        }
        actions={
          <button type="button" className="btn btn-primary" onClick={() => onNavigate("generate")}>
            生成视频
          </button>
        }
      />

      <main className="page">
        <AnimatedContent className="page-head">
          <div>
            <h1 className="page-title">素材库</h1>
            <p className="page-sub">所有导出过的视频都在这里：播放、改名、加入拼接或删除。</p>
          </div>
          <div className="search-box">
            <span className="search-icon">{icons.search}</span>
            <input
              className="search-input"
              type="search"
              value={query}
              placeholder="按名称搜索素材"
              aria-label="按名称搜索素材"
              onChange={(event) => setQuery(event.target.value)}
            />
            {query ? (
              <button type="button" className="search-clear" aria-label="清空搜索" onClick={() => setQuery("")}>
                ✕
              </button>
            ) : null}
          </div>
        </AnimatedContent>

        {error ? (
          <div className="alert error" role="alert">
            {error}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => void load()}>
              重试
            </button>
          </div>
        ) : null}

        {loading && items.length === 0 ? (
          <div className="skeleton-grid">
            {[0, 1, 2].map((key) => (
              <div key={key} className="lib-card skeleton" />
            ))}
          </div>
        ) : null}

        {!loading && items.length === 0 ? (
          <div className="empty-state">
            <svg width="120" height="90" viewBox="0 0 120 90" fill="none" aria-hidden="true">
              <rect x="10" y="14" width="72" height="46" rx="8" stroke="#CBD5E1" strokeWidth="2" />
              <path d="M34 30v14l12-7-12-7Z" fill="#CBD5E1" />
              <rect x="34" y="52" width="76" height="24" rx="8" fill="#F1F5F9" stroke="#E2E8F0" />
              <path d="M46 64h30" stroke="#CBD5E1" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <h2>还没有任何视频</h2>
            <p>先在「生成视频」里写一段讲解，导出后就会出现在这里。</p>
            <button type="button" className="btn btn-primary" onClick={() => onNavigate("generate")}>
              生成第一个视频
            </button>
          </div>
        ) : null}

        {!loading && items.length > 0 && filtered.length === 0 ? (
          <div className="empty-state compact">
            <h2>没有匹配「{query}」的素材</h2>
            <p>换个关键词试试，或清空搜索。</p>
            <button type="button" className="btn btn-ghost" onClick={() => setQuery("")}>
              清空搜索
            </button>
          </div>
        ) : null}

        {filtered.length > 0 ? (
          <div className="lib-grid">
            {filtered.map((item) => {
              const isEditing = editingId === item.id;
              return (
                <SpotlightCard as="article" key={item.id} className="lib-card" spotlightColor="rgba(15, 118, 110, 0.08)" spotlightSize={320}>
                  <button
                    type="button"
                    className="lib-thumb"
                    onClick={() => setPlaying(item)}
                    aria-label={`播放 ${item.name}`}
                  >
                    <video src={`${item.videoUrl}#t=0.6`} muted playsInline preload="metadata" draggable={false} />
                    <span className="lib-play">{icons.play}</span>
                    <span className="lib-duration">{formatClock(item.durationInSeconds)}</span>
                    <span className="lib-ratio">{item.ratio}</span>
                  </button>

                  <div className="lib-body">
                    {isEditing ? (
                      <>
                        <input
                          className="input"
                          value={draft}
                          autoFocus
                          maxLength={100}
                          aria-label={`重命名 ${item.name}`}
                          onChange={(event) => {
                            setDraft(event.target.value);
                            setRenameError(null);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void saveRename(item);
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setEditingId(null);
                            }
                          }}
                        />
                        {renameError ? <p className="field-error">{renameError}</p> : null}
                        <div className="lib-actions">
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            disabled={renameBusy}
                            onClick={() => void saveRename(item)}
                          >
                            {renameBusy ? "保存中…" : "保存"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            disabled={renameBusy}
                            onClick={() => setEditingId(null)}
                          >
                            取消
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <h3 className="lib-name" title={item.name}>
                          {item.name}
                        </h3>
                        <p className="lib-meta">
                          {item.width}×{item.height} · {formatSize(item.fileSize)}
                          {item.hasNarration ? " · 有配音" : ""}
                          {item.hasSubtitles ? " · 有字幕" : ""}
                          {item.kind === "merge" ? " · 合并" : ""}
                        </p>
                        <div className="lib-actions">
                          <button type="button" className="icon-btn" onClick={() => setPlaying(item)}>
                            {icons.play}
                            播放
                          </button>
                          <DownloadVideo id={item.id} name={item.name} className="icon-btn" href={item.downloadUrl}>
                            {icons.download}
                            下载
                          </DownloadVideo>
                          <button
                            type="button"
                            className="icon-btn"
                            onClick={() => {
                              setEditingId(item.id);
                              setDraft(item.name);
                              setRenameError(null);
                            }}
                          >
                            {icons.edit}
                            重命名
                          </button>
                          <button type="button" className="icon-btn" onClick={() => addToMerge(item.id)}>
                            {icons.add}
                            拼接
                          </button>
                          <button
                            type="button"
                            className="icon-btn danger"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleting(item);
                            }}
                          >
                            {icons.trash}
                            删除
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </SpotlightCard>
              );
            })}
          </div>
        ) : null}
      </main>

      <VideoLightbox open={playing !== null} title={playing?.name ?? ""} onClose={() => setPlaying(null)}>
        {playing ? (
          <video
            className="lightbox-video"
            src={playing.videoUrl}
            controls
            controlsList="nofullscreen nodownload"
            autoPlay
            playsInline
            preload="metadata"
            draggable={false}
          />
        ) : null}
      </VideoLightbox>

      {deleting ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="确认删除视频"
          onClick={(event) => {
            if (event.target === event.currentTarget && !deleteBusy) {
              setDeleting(null);
            }
          }}
        >
          <div className="modal">
            <h3>删除视频</h3>
            <p className="modal-name">「{deleting.name}」</p>
            <p className="modal-note">
              删除会同时移除 output/ 中的视频文件与素材记录，并从拼接列表移除；已导出的合并视频不受影响。
            </p>
            {deleteError ? (
              <div className="alert error" role="alert">
                {deleteError}
              </div>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" disabled={deleteBusy} onClick={() => setDeleting(null)}>
                取消
              </button>
              <button type="button" className="btn btn-danger" disabled={deleteBusy} onClick={() => void confirmDelete()}>
                {deleteBusy ? "删除中…" : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
