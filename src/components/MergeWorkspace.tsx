"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import MergePreview from "./MergePreview";
import SiteHeader from "./SiteHeader";
import Toast from "./Toast";
import VideoLightbox, { type VideoLightboxHandle } from "./VideoLightbox";
import ResultVideo from "./ResultVideo";
import DownloadVideo from "./DownloadVideo";
import AnimatedContent from "./react-bits/AnimatedContent";
import type { PublicJob } from "@/lib/jobs";
import type { PublicLibraryItem } from "@/lib/library";
import type { MergeSegment } from "@/remotion/merge";
import { DEFAULT_MERGE_PROPS } from "@/remotion/merge";
import { RATIO_MAP, VIDEO_CONFIG, VIDEO_RATIOS, getVideoSize, isRatioId, type RatioId } from "@/remotion/params";
import type { WorkbenchView } from "./Workbench";

const SELECTION_KEY = "codevideo:merge:selection";
const PROJECT_KEY = "codevideo:merge:project:v1";
const decodeSelection = (raw: string | null): string[] => {
  const data: unknown = raw ? JSON.parse(raw) : [];
  return Array.isArray(data) ? [...new Set(data.filter((id): id is string => typeof id === "string"))] : [];
};

const STATUS_TEXT: Record<PublicJob["status"], string> = {
  queued: "排队中",
  rendering: "渲染中",
  success: "已导出",
  failed: "导出失败",
};

const BACKGROUND_PRESETS = ["#0B1120", "#0F766E", "#111827", "#FFFFFF", "#F1F5F9"];

const formatClock = (seconds: number): string => {
  const total = Math.round(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const formatSize = (bytes: number): string => (bytes ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : "—");

const icons = {
  up: "↑",
  down: "↓",
  remove: "✕",
  search: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="11" cy="11" r="6" stroke="currentColor" strokeWidth="1.7" />
      <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  ),
  plus: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  ),
  download: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v10m0 0-4-4m4 4 4-4M5 18h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  expand: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

type MergeWorkspaceProps = {
  active: boolean;
  onNavigate: (view: WorkbenchView) => void;
  onOpenNav: () => void;
};

export default function MergeWorkspace({ active, onNavigate, onOpenNav }: MergeWorkspaceProps) {
  const [items, setItems] = useState<PublicLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);
  const [libraryLoaded, setLibraryLoaded] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const canSave = useRef(false);
  const [resultOpen, setResultOpen] = useState(false);
  const [playing, setPlaying] = useState<PublicLibraryItem | null>(null);
  const [query, setQuery] = useState("");
  const [ratioOverride, setRatioOverride] = useState<RatioId | null>(null);
  const [background, setBackground] = useState(DEFAULT_MERGE_PROPS.backgroundColor);
  const [job, setJob] = useState<PublicJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const zoomRef = useRef<VideoLightboxHandle>(null);
  const openPreviewFullscreen = () => {
    flushSync(() => setZoomOpen(true));
    void zoomRef.current?.enterFullscreen();
  };
  const [toast, setToast] = useState<string | null>(null);
  const pollTimer = useRef<number | null>(null);
  const refreshedJobId = useRef<string | null>(null);

  const loadLibrary = useCallback(async () => {
    try {
      const response = await fetch("/api/library", { cache: "no-store" });
      const data = (await response.json().catch(() => null)) as
        | { items?: PublicLibraryItem[]; message?: string }
        | null;
      if (!response.ok || !data?.items) {
        setLibraryError(data?.message ?? `读取素材库失败（HTTP ${response.status}）。`);
        return;
      }
      setItems(data.items);
      setLibraryLoaded(true);
      setLibraryError(null);
    } catch {
      setLibraryError("无法连接素材服务，请确认服务仍在运行。");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (active) void loadLibrary();
  }, [active, loadLibrary]);

  // 恢复上次的拼接顺序
  useEffect(() => {
    try {
      setSelectedIds(decodeSelection(window.localStorage.getItem(SELECTION_KEY)));
      const raw = window.localStorage.getItem(PROJECT_KEY);
      if (raw) {
        const saved = JSON.parse(raw);
        if (!saved || saved.version !== 1) throw new Error("Unknown project");
        setRatioOverride(isRatioId(saved.ratio) ? saved.ratio : null);
        if (typeof saved.background === "string" && /^#[a-f\d]{6}$/i.test(saved.background)) setBackground(saved.background);
        if (typeof saved.jobId === "string" && /^[a-f\d-]{36}$/i.test(saved.jobId)) setJobId(saved.jobId);
      }
      canSave.current = true;
    } catch {
      setStorageError("拼接草稿读取失败，原记录已保留；本次修改暂未自动保存。");
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready || !active || !canSave.current) return;
    // The library can add selections while this workspace is hidden.
    try { setSelectedIds(decodeSelection(window.localStorage.getItem(SELECTION_KEY))); } catch {}
  }, [active, ready]);

  useEffect(() => {
    if (!ready || !canSave.current) return;
    try {
      window.localStorage.setItem(SELECTION_KEY, JSON.stringify(selectedIds));
      window.localStorage.setItem(PROJECT_KEY, JSON.stringify({ version: 1, ratio: ratioOverride, background, jobId }));
      setStorageError(null);
    } catch {
      setStorageError("拼接草稿保存失败，请保留当前页面并检查浏览器存储空间。");
    }
  }, [selectedIds, ratioOverride, background, jobId, ready]);

  useEffect(() => {
    if (!active) {
      setPlaying(null);
      setZoomOpen(false);
    }
  }, [active, zoomOpen, playing]);

  useEffect(() => {
    if (!ready || !jobId) return;
    const controller = new AbortController();
    void fetch(`/api/jobs/${jobId}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (response.ok && data.job) setJob(data.job);
      else if (response.status === 404) {
        setJob(null); setJobId(null);
        setPollError("上次拼接任务已失效，已保留片段与设置，请重新导出。");
      } else setPollError("暂时无法恢复拼接进度，请刷新重试。");
    }).catch(() => { if (!controller.signal.aborted) setPollError("暂时无法恢复拼接进度，请刷新重试。"); });
    return () => controller.abort();
  }, [jobId, ready]);

  // 素材被删除时自动从拼接序列剔除
  useEffect(() => {
    if (!libraryLoaded || !ready) {
      return;
    }
    setSelectedIds((previous) => {
      const next = previous.filter((id) => items.some((item) => item.id === id));
      return next.length === previous.length ? previous : next;
    });
  }, [items, libraryLoaded, ready]);

  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const segmentItems = useMemo(
    () => selectedIds.map((id) => itemMap.get(id)).filter((item): item is PublicLibraryItem => Boolean(item)),
    [selectedIds, itemMap],
  );
  const segments = useMemo<MergeSegment[]>(
    () => segmentItems.map((item) => ({ id: item.id, src: item.videoUrl, durationInFrames: item.durationInFrames })),
    [segmentItems],
  );

  const firstRatio = segmentItems[0]?.ratio;
  const effectiveRatio: RatioId = ratioOverride ?? firstRatio ?? "9:16";
  const totalFrames = segments.reduce((total, segment) => total + segment.durationInFrames, 0);
  const totalSeconds = totalFrames / VIDEO_CONFIG.fps;
  const outputSize = getVideoSize({ ratio: effectiveRatio });

  const isBusy = job?.status === "queued" || job?.status === "rendering";
  const isWorking = submitting || isBusy;
  const progressPercent = Math.round((job?.progress ?? 0) * 100);
  const statusKey = job ? job.status : "idle";
  const canExport = ready && segments.length >= 2 && !isWorking;

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) {
      return items;
    }
    return items.filter((item) => item.name.toLowerCase().includes(keyword));
  }, [items, query]);

  const addSegment = useCallback((id: string) => {
    setSelectedIds((previous) => (previous.includes(id) ? previous : [...previous, id]));
  }, []);

  const removeSegment = useCallback((id: string) => {
    setSelectedIds((previous) => previous.filter((entry) => entry !== id));
  }, []);

  const moveSegment = useCallback((index: number, delta: number) => {
    setSelectedIds((previous) => {
      const target = index + delta;
      if (target < 0 || target >= previous.length) {
        return previous;
      }
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const reorder = useCallback((from: number, to: number) => {
    setSelectedIds((previous) => {
      if (from === to || from < 0 || to < 0 || from >= previous.length || to >= previous.length) {
        return previous;
      }
      const next = [...previous];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "rendering")) {
      return;
    }
    const controller = new AbortController();
    const tick = async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          if (response.status === 404) {
            setJob(null); setJobId(null);
            setPollError("拼接任务已失效，已保留片段与设置，请重新导出。");
            return;
          }
          setPollError(`查询进度失败（HTTP ${response.status}），正在重试…`);
          return;
        }
        const data = (await response.json()) as { job: PublicJob };
        setJob(data.job);
        setPollError(null);
        if (data.job.status === "success" && refreshedJobId.current !== data.job.id) {
          refreshedJobId.current = data.job.id;
          setToast("合并视频已导出");
          void loadLibrary();
        }
      } catch {
        if (!controller.signal.aborted) {
          setPollError("暂时无法连接渲染服务，正在重试…");
        }
      }
    };
    void tick();
    pollTimer.current = window.setInterval(tick, 1200);
    return () => {
      controller.abort();
      if (pollTimer.current !== null) {
        window.clearInterval(pollTimer.current);
        pollTimer.current = null;
      }
    };
  }, [job?.id, job?.status, loadLibrary]);

  const handleExport = useCallback(async () => {
    setSubmitError(null);
    setPollError(null);
    if (segments.length < 2) {
      setSubmitError("至少选择 2 个片段才能拼接。");
      return;
    }
    if (isWorking) {
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch("/api/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          segmentIds: segments.map((segment) => segment.id),
          ratio: effectiveRatio,
          backgroundColor: background,
        }),
      });
      const data = (await response.json().catch(() => null)) as
        | { job?: PublicJob; message?: string }
        | null;
      if (!response.ok || !data?.job) {
        setSubmitError(data?.message ?? `创建拼接任务失败（HTTP ${response.status}）。`);
        return;
      }
      setJob(data.job);
      setJobId(data.job.id);
    } catch {
      setSubmitError("无法连接渲染服务，请确认服务仍在运行。");
    } finally {
      setSubmitting(false);
    }
  }, [segments, effectiveRatio, background, isWorking]);

  return (
    <>
      <SiteHeader
        view="merge"
        projectName={`拼接项目 · ${segments.length} 段`}
        onOpenNav={onOpenNav}
        status={
          <span className={`status-pill ${statusKey}`} aria-live="polite">
            <i aria-hidden="true" />
            {job ? STATUS_TEXT[job.status] : "未开始"}
            {job?.status === "rendering" ? ` · ${progressPercent}%` : null}
          </span>
        }
        actions={
          <button type="button" className="btn btn-primary" onClick={() => void handleExport()} disabled={!canExport}>
            {isWorking ? <span className="spinner" aria-hidden="true" /> : null}
            {submitting ? "提交中…" : isBusy ? "导出中…" : "导出合并视频"}
          </button>
        }
      />

      <main className="page">
        {storageError ? <div className="alert error" role="alert">{storageError}</div> : null}
        <AnimatedContent className="page-head" active={active}>
          <div>
            <h1 className="page-title">视频拼接</h1>
            <p className="page-sub">按顺序连接多支成片，配音与字幕随片段一起保留。</p>
          </div>
          <div className="head-chips">
            <span className="chip teal">{segments.length} 段</span>
            <span className="chip neutral">总时长 {formatClock(totalSeconds)}</span>
            <span className="chip neutral">
              {outputSize.width}×{outputSize.height}
            </span>
          </div>
        </AnimatedContent>

        <div className="split split-merge">
          <div className="merge-left">
            <section className="card sequence-card">
              <div className="card-head">
                <div className="card-title">
                  <h2>拼接序列</h2>
                  <span className="card-note">拖动或用箭头调整播放顺序</span>
                </div>
                {segments.length > 0 ? (
                  <button type="button" className="btn-text" onClick={() => setSelectedIds([])}>
                    清空
                  </button>
                ) : null}
              </div>

              <div className="sequence-body">
                {segments.length === 0 ? (
                  <div className="hint-line">还没有片段，从右侧素材库点「加入」添加至少 2 个。</div>
                ) : (
                  <ol className="segment-list">
                    {segmentItems.map((item, index) => {
                      const classes = [
                        "segment-row",
                        draggingIndex === index ? "dragging" : "",
                        dragOverIndex === index && draggingIndex !== index ? "drop-target" : "",
                      ]
                        .join(" ")
                        .trim();
                      return (
                        <li
                          key={item.id}
                          className={classes}
                          draggable
                          onDragStart={() => {
                            setDraggingIndex(index);
                            setDragOverIndex(index);
                          }}
                          onDragOver={(event) => {
                            event.preventDefault();
                            setDragOverIndex(index);
                          }}
                          onDrop={(event) => {
                            event.preventDefault();
                            if (draggingIndex !== null) {
                              reorder(draggingIndex, index);
                            }
                            setDraggingIndex(null);
                            setDragOverIndex(null);
                          }}
                          onDragEnd={() => {
                            setDraggingIndex(null);
                            setDragOverIndex(null);
                          }}
                        >
                          <span className={`segment-index${index === 0 ? " first" : ""}`}>{index + 1}</span>
                          <span className="segment-thumb">
                            <video src={`${item.videoUrl}#t=0.6`} muted playsInline preload="metadata" draggable={false} />
                          </span>
                          <span className="segment-main">
                            <span className="segment-title" title={item.name}>
                              {item.name}
                            </span>
                            <span className="segment-meta">
                              {formatClock(item.durationInSeconds)} · {item.ratio}
                              {item.hasNarration ? " · 有配音" : ""}
                              {item.hasSubtitles ? " · 有字幕" : ""}
                            </span>
                          </span>
                          <span className="segment-tools">
                            <button type="button" className="icon-btn tiny" aria-label={`上移 ${item.name}`} title="上移" disabled={index === 0} onClick={() => moveSegment(index, -1)}>
                              {icons.up}
                            </button>
                            <button type="button" className="icon-btn tiny" aria-label={`下移 ${item.name}`} title="下移" disabled={index === segmentItems.length - 1} onClick={() => moveSegment(index, 1)}>
                              {icons.down}
                            </button>
                            <button type="button" className="icon-btn tiny danger" aria-label={`移除 ${item.name}`} title="移除（不删除原视频）" onClick={() => removeSegment(item.id)}>
                              {icons.remove}
                            </button>
                          </span>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>

              <div className="sequence-foot">
                <div className="field compact">
                  <label className="label" htmlFor="merge-ratio">
                    统一比例
                  </label>
                  <select
                    id="merge-ratio"
                    className="input"
                    value={ratioOverride ?? "auto"}
                    onChange={(event) => setRatioOverride(event.target.value === "auto" ? null : (event.target.value as RatioId))}
                  >
                    <option value="auto">跟随第一个片段{firstRatio ? `（${firstRatio}）` : ""}</option>
                    {VIDEO_RATIOS.map((ratio) => (
                      <option key={ratio.id} value={ratio.id}>
                        {ratio.id} · {ratio.width}×{ratio.height}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field compact">
                  <span className="label">留白背景</span>
                  <div className="swatch-row">
                    {BACKGROUND_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className={`swatch-btn${background.toLowerCase() === preset.toLowerCase() ? " active" : ""}`}
                        style={{ background: preset }}
                        aria-label={`背景色 ${preset}`}
                        title={preset}
                        onClick={() => setBackground(preset)}
                      />
                    ))}
                    <input
                      type="color"
                      className="color-picker"
                      aria-label="自定义背景色"
                      value={/^#[0-9a-fA-F]{6}$/.test(background) ? background : "#0B1120"}
                      onChange={(event) => setBackground(event.target.value.toUpperCase())}
                    />
                  </div>
                  <p className="field-hint">不同尺寸片段等比缩放居中，空余部分填充此颜色。</p>
                </div>
              </div>
            </section>

            <section className="card export-card">
              <div className="card-head">
                <div className="card-title">
                  <h2>导出</h2>
                  <span className="card-note">总时长 {formatClock(totalSeconds)}</span>
                </div>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => void handleExport()} disabled={!canExport}>
                  {isWorking ? <span className="spinner" aria-hidden="true" /> : null}
                  {isWorking ? "导出中…" : "导出合并视频"}
                </button>
              </div>

              <div className="export-body">
                <div className="status-row">
                  <span className={`status-pill ${statusKey}`}>
                    <i aria-hidden="true" />
                    {job ? STATUS_TEXT[job.status] : "尚未导出"}
                  </span>
                  <span className="status-detail">
                    {job && isBusy
                      ? `${job.renderedFrames}/${job.totalFrames} 帧 · ${progressPercent}%`
                      : job?.status === "success"
                        ? `${formatClock(job.totalFrames / VIDEO_CONFIG.fps)} · ${job.outputWidth}×${job.outputHeight}`
                        : segments.length < 2
                          ? "至少需要 2 个片段"
                          : "点击导出，服务端会真实合成 MP4"}
                  </span>
                </div>

                {job && isBusy ? (
                  <div className="progress" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
                    <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                ) : null}

                {submitError ? (
                  <div className="alert error" role="alert">
                    {submitError}
                  </div>
                ) : null}
                {pollError ? <p className="notice">{pollError}</p> : null}

                {job?.status === "failed" ? (
                  <div className="alert error" role="alert">
                    <strong>合并失败</strong>
                    <span>{job.error ?? "未知错误"}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleExport()}>
                      重试
                    </button>
                  </div>
                ) : null}

                {job?.status === "success" && job.videoUrl ? (
                  <div className="result">
                    <ResultVideo key={job.id} src={job.videoUrl} title={job.name ?? "合并视频"}
                      active={active && !zoomOpen && !playing} onExpandedChange={setResultOpen}>
                      <DownloadVideo id={job.id} name={job.name ?? "合并视频"} className="btn btn-primary" href={job.downloadUrl ?? job.videoUrl}>
                        {icons.download}
                        下载合并视频
                      </DownloadVideo>
                      <button type="button" className="btn btn-ghost" onClick={() => onNavigate("library")}>
                        素材库
                      </button>
                    </ResultVideo>
                    <p className="result-note">
                      {job.name ?? "合并视频"} · {formatSize(job.fileSize ?? 0)} · output/{job.fileName}
                    </p>
                  </div>
                ) : null}
              </div>
            </section>
          </div>

          <div className="stage-col">
            <section className="card preview-card">
              <div className="card-head">
                <div className="card-title">
                  <h2>拼接预览</h2>
                  <span className="card-note">
                    {effectiveRatio} · {outputSize.width}×{outputSize.height} · {formatClock(totalSeconds)}
                  </span>
                </div>
                <div className="card-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setZoomOpen(true)} disabled={segments.length === 0}>
                    {icons.expand}
                    放大预览
                  </button>
                </div>
              </div>

              <div className="canvas">
                {segments.length > 0 ? (
                  <MergePreview active={active && !zoomOpen && !playing && !resultOpen} segments={segments} ratio={effectiveRatio} backgroundColor={background} onRequestFullscreen={openPreviewFullscreen} />
                ) : (
                  <div className="empty-state inline">
                    <h2>拼接序列为空</h2>
                    <p>从下方素材库「加入」两个以上片段，这里会按顺序实时预览。</p>
                  </div>
                )}
              </div>

              <div className="preview-meta">
                <span className="meta-item">
                  <span className="meta-label">片段</span>
                  <b>{segments.length}</b>
                </span>
                <span className="meta-item">
                  <span className="meta-label">总时长</span>
                  <b>{formatClock(totalSeconds)}</b>
                  <span className="meta-weak">{totalFrames} 帧 · {VIDEO_CONFIG.fps}fps</span>
                </span>
                <span className="meta-item">
                  <span className="meta-label">配音</span>
                  <b>{segmentItems.some((item) => item.hasNarration) ? "随片段保留" : "无"}</b>
                </span>
                <span className="meta-item">
                  <span className="meta-label">字幕</span>
                  <b>{segmentItems.some((item) => item.hasSubtitles) ? "已烙入画面" : "无"}</b>
                </span>
              </div>
            </section>

            <section className="card material-card">
              <div className="card-head">
                <div className="card-title">
                  <h2>素材库</h2>
                  <span className="card-note">{filtered.length}/{items.length} 个素材</span>
                </div>
                <div className="search-box compact">
                  <span className="search-icon">{icons.search}</span>
                  <input
                    className="search-input"
                    type="search"
                    value={query}
                    placeholder="搜索名称"
                    aria-label="搜索素材名称"
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
              </div>

              {libraryError ? (
                <div className="alert error" role="alert">
                  {libraryError}
                </div>
              ) : null}

              <div className="material-body">
                {loading && items.length === 0 ? <p className="hint-line">正在读取素材…</p> : null}
                {!loading && items.length === 0 ? (
                  <div className="empty-state inline">
                    <h2>还没有素材</h2>
                    <p>先到「生成视频」导出一支，再回来拼接。</p>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => onNavigate("generate")}>
                      去生成视频
                    </button>
                  </div>
                ) : null}

                {filtered.length === 0 && items.length > 0 ? (
                  <p className="hint-line">没有匹配「{query}」的素材。</p>
                ) : null}

                <div className="material-grid">
                  {filtered.map((item) => {
                    const added = selectedIds.includes(item.id);
                    return (
                      <article key={item.id} className={`material-item${added ? " selected" : ""}`}>
                        <button type="button" className="material-thumb" onClick={() => setPlaying(item)} aria-label={`播放 ${item.name}`}>
                          <video src={`${item.videoUrl}#t=0.6`} muted playsInline preload="metadata" draggable={false} />
                          <span className="material-duration">{formatClock(item.durationInSeconds)}</span>
                          {added ? <span className="material-check" aria-hidden="true">✓</span> : null}
                        </button>
                        <div className="material-info">
                          <span className="material-name" title={item.name}>
                            {item.name}
                          </span>
                          <span className="material-meta">
                            {item.ratio} · {item.width}×{item.height}
                          </span>
                        </div>
                        <button
                          type="button"
                          className={`btn btn-sm ${added ? "btn-ghost" : "btn-primary"}`}
                          onClick={() => (added ? removeSegment(item.id) : addSegment(item.id))}
                        >
                          {added ? "移除" : (
                            <>
                              {icons.plus}
                              加入
                            </>
                          )}
                        </button>
                      </article>
                    );
                  })}
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>

      <VideoLightbox open={playing !== null} title={playing?.name ?? ""} onClose={() => setPlaying(null)}>
        {playing ? (
          <video className="lightbox-video" src={playing.videoUrl} controls controlsList="nofullscreen nodownload" autoPlay playsInline preload="metadata" draggable={false} />
        ) : null}
      </VideoLightbox>

      <VideoLightbox
        ref={zoomRef}
        open={zoomOpen}
        title={`拼接预览 · ${segments.length} 段 · ${formatClock(totalSeconds)}`}
        onClose={() => setZoomOpen(false)}
      >
        <MergePreview active={active && zoomOpen} segments={segments} ratio={effectiveRatio} backgroundColor={background} />
      </VideoLightbox>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
