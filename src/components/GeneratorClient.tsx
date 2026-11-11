"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import PreviewPlayer from "./PreviewPlayer";
import SiteHeader from "./SiteHeader";
import Toast from "./Toast";
import TemplateThumb from "./TemplateThumb";
import VideoLightbox from "./VideoLightbox";
import LayerOverlay from "./LayerOverlay";
import { LayerAssetsPanel, LayerInspector, type UploadItem } from "./LayerPanels";
import type { PublicJob } from "@/lib/jobs";
import type { TtsCue, VoiceOption } from "@/lib/tts/types";
import type { TtsConfig } from "@/lib/tts/types";
import {
  DEFAULT_VIDEO_PROPS,
  DURATION_LIMITS,
  INPUT_LIMITS,
  RATIO_MAP,
  TEMPLATE_MAP,
  VIDEO_CONFIG,
  VIDEO_RATIOS,
  VIDEO_TEMPLATES,
  countCharacters,
  getDurationInFrames,
  getVideoSize,
  toFormValues,
  toPreviewProps,
  validateFormValues,
  type RatioId,
  type TemplateId,
  type VideoFieldErrors,
  type VideoFormValues,
  type VideoProps,
} from "@/remotion/params";
import {
  NARRATION_LIMITS,
  buildScriptFromLines,
  describeDurationFit,
  resolveDurationFromAudio,
  type DurationMode,
} from "@/remotion/narration";
import { SUBTITLE_LIMITS, wrapSubtitleText, type SubtitlePosition } from "@/remotion/subtitles";
import { VIDEO_NAME_MAX_LENGTH, sanitizeVideoName } from "@/lib/videoName";
import {
  createImageLayer,
  createTextLayer,
  type ImageLayer,
  type Layer,
  type TextLayer,
} from "@/remotion/layers";
import type { WorkbenchView } from "./Workbench";

type TabId = "content" | "visual" | "layers" | "voice" | "subtitle";

type TtsResult = {
  id: string;
  audioUrl: string;
  srtUrl: string;
  durationSeconds: number;
  voiceId: string;
  voiceName: string;
  provider: string;
  speed: number;
  script: string;
  cues: TtsCue[];
  chunkCount: number;
};

type GeneratorClientProps = {
  onNavigate: (view: WorkbenchView) => void;
  onOpenNav: () => void;
};

const LINE_FIELDS = ["line0", "line1", "line2"] as const;
const LINE_LABELS = ["第一段", "第二段", "第三段"];
const FORM_ID = "video-settings-form";

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "content", label: "内容", hint: "标题、文案与名称" },
  { id: "visual", label: "画面", hint: "模板、比例、时长" },
  { id: "layers", label: "图层", hint: "图片与文字排版" },
  { id: "voice", label: "配音", hint: "讲稿、音色、试听" },
  { id: "subtitle", label: "字幕", hint: "样式、断句、SRT" },
];

const STATUS_TEXT: Record<PublicJob["status"], string> = {
  queued: "排队中",
  rendering: "渲染中",
  success: "已导出",
  failed: "导出失败",
};

const formatClock = (seconds: number): string => {
  const total = Math.round(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};

const formatSize = (bytes: number): string => (bytes ? `${(bytes / 1024 / 1024).toFixed(2)} MB` : "—");

const icons = {
  play: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 5.5v13l10-6.5-10-6.5Z" fill="currentColor" />
    </svg>
  ),
  pause: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="7" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
      <rect x="13.5" y="5" width="3.5" height="14" rx="1" fill="currentColor" />
    </svg>
  ),
  download: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 4v10m0 0-4-4m4 4 4-4M5 18h14" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  expand: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 4H4v5M15 4h5v5M9 20H4v-5M15 20h5v-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  mic: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" stroke="currentColor" strokeWidth="1.6" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  ),
  spark: (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 4 1.8 4.8L18.6 10l-4.8 1.8L12 16.6l-1.8-4.8L5.4 10l4.8-1.2L12 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  ),
};

export default function GeneratorClient({ onNavigate, onOpenNav }: GeneratorClientProps) {
  const [tab, setTab] = useState<TabId>("content");
  const [values, setValues] = useState<VideoFormValues>(() => toFormValues(DEFAULT_VIDEO_PROPS));
  const [errors, setErrors] = useState<VideoFieldErrors>({});
  const [job, setJob] = useState<PublicJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [submittedProps, setSubmittedProps] = useState<VideoProps | null>(null);
  const [durationInput, setDurationInput] = useState(String(DEFAULT_VIDEO_PROPS.durationInSeconds));
  const [videoName, setVideoName] = useState(DEFAULT_VIDEO_PROPS.title);
  const [nameTouched, setNameTouched] = useState(false);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ---------------- 配音 ----------------
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [script, setScript] = useState(() =>
    buildScriptFromLines(DEFAULT_VIDEO_PROPS.title, DEFAULT_VIDEO_PROPS.lines),
  );
  const [scriptTouched, setScriptTouched] = useState(false);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [ttsConfig, setTtsConfig] = useState<TtsConfig | null>(null);
  const [voiceId, setVoiceId] = useState("");
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(0.9);
  const [tts, setTts] = useState<TtsResult | null>(null);
  const [ttsStatus, setTtsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [durationMode, setDurationMode] = useState<DurationMode>("voice");
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);

  // ---------------- 字幕 ----------------
  const [subtitleEnabled, setSubtitleEnabled] = useState(true);
  const [subtitleTexts, setSubtitleTexts] = useState<string[]>([]);
  const [fontScale, setFontScale] = useState(1);
  const [subtitleColor, setSubtitleColor] = useState("#FFFFFF");
  const [subtitleBg, setSubtitleBg] = useState(0.45);
  const [subtitlePos, setSubtitlePos] = useState<SubtitlePosition>("bottom");

  const pollTimer = useRef<number | null>(null);

  // ---------------- 图层 ----------------
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editorPlaying, setEditorPlaying] = useState(false);

  // 支持 ?tab=voice 这类深链，方便分享与验收
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "content" || requested === "visual" || requested === "layers" || requested === "voice" || requested === "subtitle") {
      setTab(requested);
    }
  }, []);

  const updateField = useCallback((field: keyof VideoFormValues, value: string | number) => {
    setValues((previous) => {
      const next = { ...previous, [field]: value };
      if (typeof value === "string") {
        const result = validateFormValues(next);
        setErrors((previousErrors) => {
          const updated = { ...previousErrors };
          const key = field as keyof VideoFieldErrors;
          if (result.ok) {
            delete updated[key];
          } else if (result.errors[key]) {
            updated[key] = result.errors[key];
          }
          return updated;
        });
      }
      return next;
    });
  }, []);

  // 名称默认跟随标题
  useEffect(() => {
    if (!nameTouched) {
      setVideoName(values.title);
    }
  }, [values.title, nameTouched]);

  // 讲稿默认跟随文案，用户改过后不再覆盖
  useEffect(() => {
    if (!scriptTouched) {
      setScript(buildScriptFromLines(values.title, [values.line0, values.line1, values.line2]));
    }
  }, [values.title, values.line0, values.line1, values.line2, scriptTouched]);

  useEffect(() => {
    setDurationInput(String(values.durationInSeconds));
  }, [values.durationInSeconds]);

  // 音色列表
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/tts/voices", { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as
          | { config?: TtsConfig; voices?: VoiceOption[] }
          | null;
        if (cancelled || !data) {
          return;
        }
        setTtsConfig(data.config ?? null);
        const list = data.voices ?? [];
        setVoices(list);
        setVoiceId((previous) => (previous && list.some((voice) => voice.id === previous) ? previous : (list[0]?.id ?? "")));
      } catch {
        if (!cancelled) {
          setTtsConfig({
            provider: null,
            providerLabel: "",
            configured: false,
            message: "无法读取音色列表，请确认服务仍在运行。",
          });
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  // 导出状态轮询
  useEffect(() => {
    if (!job || (job.status !== "queued" && job.status !== "rendering")) {
      return;
    }
    const controller = new AbortController();
    const tick = async () => {
      try {
        const response = await fetch(`/api/jobs/${job.id}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) {
          setPollError(`查询进度失败（HTTP ${response.status}），正在重试…`);
          return;
        }
        const data = (await response.json()) as { job: PublicJob };
        setJob(data.job);
        setPollError(null);
        if (data.job.status === "success") {
          setToast("视频已导出，可在右侧下载或去素材库查看");
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
  }, [job?.id, job?.status]);

  const selectedVoice = voices.find((voice) => voice.id === voiceId) ?? null;
  const audioDuration = tts?.durationSeconds ?? 0;
  const ttsStale = Boolean(tts) && (tts?.script !== script || tts?.voiceId !== voiceId || Math.abs((tts?.speed ?? 0) - speed) > 0.001);
  const durationFit = describeDurationFit(audioDuration, values.durationInSeconds);
  const voiceDuration = audioDuration > 0 ? resolveDurationFromAudio(audioDuration) : null;
  const voiceTooLong = audioDuration > DURATION_LIMITS.max;

  // 预览时长（跟随配音时用音频时长），字幕不能超出这一范围
  const resolvedPreviewSeconds =
    durationMode === "voice" && voiceDuration !== null ? voiceDuration : values.durationInSeconds;
  const previewMaxFrame = Math.round(Math.max(1, resolvedPreviewSeconds) * VIDEO_CONFIG.fps);

  const subtitleCues = useMemo(() => {
    if (!tts) {
      return [];
    }
    return tts.cues
      .filter((cue) => cue.startFrame < previewMaxFrame)
      .map((cue, index) => {
        const text = (subtitleTexts[index] ?? cue.text).trim();
        return {
          text,
          lines: wrapSubtitleText(text, SUBTITLE_LIMITS.lineMaxChars),
          startFrame: cue.startFrame,
          endFrame: Math.min(cue.endFrame, previewMaxFrame),
        };
      });
  }, [tts, subtitleTexts, previewMaxFrame]);

  const previewProps = useMemo<VideoProps>(() => {
    const base = toPreviewProps(values);
    const seconds = resolvedPreviewSeconds;
    const narrationEnabled = voiceEnabled && Boolean(tts);
    return {
      ...base,
      durationInSeconds: seconds,
      durationMode: narrationEnabled ? durationMode : "fixed",
      narration: {
        enabled: narrationEnabled,
        ttsId: tts?.id ?? null,
        audioSrc: tts?.audioUrl ?? null,
        script,
        voiceId: selectedVoice?.id ?? null,
        voiceName: selectedVoice?.name ?? null,
        provider: (tts?.provider as VideoProps["narration"]["provider"]) ?? null,
        speed,
        volume,
        audioDurationSeconds: audioDuration,
      },
      layers,
      subtitles: {
        enabled: subtitleEnabled && subtitleCues.length > 0,
        fontScale,
        color: subtitleColor,
        backgroundOpacity: subtitleBg,
        position: subtitlePos,
        cues: subtitleCues,
      },
    };
  }, [
    values,
    resolvedPreviewSeconds,
    voiceEnabled,
    tts,
    script,
    selectedVoice,
    speed,
    volume,
    audioDuration,
    subtitleEnabled,
    subtitleCues,
    fontScale,
    subtitleColor,
    subtitleBg,
    subtitlePos,
    layers,
  ]);

  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const isBusy = job?.status === "queued" || job?.status === "rendering";
  const isWorking = submitting || isBusy;
  const progressPercent = Math.round((job?.progress ?? 0) * 100);
  const statusKey = job ? job.status : "idle";
  const durationFrames = getDurationInFrames(previewProps);
  const previewSize = getVideoSize(previewProps);
  const nameCount = countCharacters(videoName);
  const safeName = sanitizeVideoName(videoName, values.title);

  const handleGenerateTts = useCallback(async () => {
    if (!script.trim()) {
      setTtsError("讲解稿不能为空。");
      setTtsStatus("error");
      return;
    }
    if (!voiceId) {
      setTtsError("请先选择音色（若列表为空，说明还没有可用的配音服务）。");
      setTtsStatus("error");
      return;
    }
    setTtsStatus("loading");
    setTtsError(null);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ script, voiceId, speed }),
      });
      const data = (await response.json().catch(() => null)) as
        | { tts?: TtsResult; message?: string }
        | null;
      if (!response.ok || !data?.tts) {
        setTtsError(data?.message ?? `配音生成失败（HTTP ${response.status}）。`);
        setTtsStatus("error");
        return;
      }
      setTts(data.tts);
      setSubtitleTexts(data.tts.cues.map((cue) => cue.text));
      setTtsStatus("ready");
      setVoiceEnabled(true);
      const seconds = data.tts.durationSeconds;
      if (seconds > DURATION_LIMITS.max) {
        setTtsError(
          `配音 ${seconds.toFixed(1)} 秒，超过单段 15 秒上限：请缩短讲稿、适当提高语速后重新生成，或拆成多个镜头。`,
        );
      }
    } catch {
      setTtsError("无法连接配音服务，请确认开发服务器仍在运行。");
      setTtsStatus("error");
    }
  }, [script, voiceId, speed]);

  const togglePreviewAudio = useCallback(async () => {
    const audio = voiceAudioRef.current;
    if (!audio) {
      return;
    }
    try {
      if (audio.paused) {
        await audio.play();
        setPreviewPlaying(true);
      } else {
        audio.pause();
        setPreviewPlaying(false);
      }
    } catch {
      setPreviewPlaying(false);
    }
  }, []);

  // ---------------- 上传与图层操作 ----------------
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const response = await fetch("/api/uploads", { cache: "no-store" });
        const data = (await response.json().catch(() => null)) as { uploads?: UploadItem[] } | null;
        if (!cancelled && data?.uploads) {
          setUploads(data.uploads);
        }
      } catch {
        // 素材列表读取失败不影响其它功能
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const uploadFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (list.length === 0) {
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      for (const file of list) {
        const form = new FormData();
        form.append("file", file);
        const response = await fetch("/api/uploads", { method: "POST", body: form });
        const data = (await response.json().catch(() => null)) as
          | { upload?: UploadItem; message?: string }
          | null;
        if (!response.ok || !data?.upload) {
          setUploadError(data?.message ?? `上传失败（HTTP ${response.status}）。`);
          continue;
        }
        const upload = data.upload;
        setUploads((previous) => [upload, ...previous.filter((item) => item.id !== upload.id)]);
      }
    } catch {
      setUploadError("无法连接服务器，图片没有上传。");
    } finally {
      setUploading(false);
    }
  }, []);

  const addImageLayer = useCallback(
    (upload: UploadItem) => {
      const canvas = getVideoSize(previewProps);
      const layer = createImageLayer(upload, canvas, {
        endFrame: getDurationInFrames(previewProps),
      });
      setLayers((previous) => [...previous, layer]);
      setSelectedLayerId(layer.id);
    },
    [previewProps],
  );

  const addTextLayer = useCallback(() => {
    const layer = createTextLayer({ endFrame: getDurationInFrames(previewProps) });
    setLayers((previous) => [...previous, layer]);
    setSelectedLayerId(layer.id);
  }, [previewProps]);

  const updateLayer = useCallback(
    (id: string, patch: Partial<TextLayer> & Partial<ImageLayer>) => {
      const total = getDurationInFrames(previewProps);
      setLayers((previous) =>
        previous.map((layer) => {
          if (layer.id !== id) {
            return layer;
          }
          const next = { ...layer, ...patch } as Layer;
          const start = Math.min(total - 1, Math.max(0, Math.round(next.startFrame)));
          const end = Math.min(total, Math.max(start + 1, Math.round(next.endFrame)));
          return { ...next, startFrame: start, endFrame: end };
        }),
      );
    },
    [previewProps],
  );

  const deleteLayer = useCallback((id: string) => {
    setLayers((previous) => previous.filter((layer) => layer.id !== id));
    setSelectedLayerId((previous) => (previous === id ? null : previous));
  }, []);

  const moveLayer = useCallback((id: string, delta: number) => {
    setLayers((previous) => {
      const index = previous.findIndex((layer) => layer.id === id);
      const target = index + delta;
      if (index < 0 || target < 0 || target >= previous.length) {
        return previous;
      }
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const toggleLayer = useCallback((id: string, key: "hidden" | "locked") => {
    setLayers((previous) =>
      previous.map((layer) => (layer.id === id ? { ...layer, [key]: !layer[key] } : layer)),
    );
  }, []);

  const handleExport = useCallback(async () => {
    setSubmitError(null);
    setPollError(null);
    if (isWorking) {
      return;
    }
    const result = validateFormValues(values);
    if (!result.ok) {
      setErrors(result.errors);
      setTab(result.errors.line0 || result.errors.line1 || result.errors.line2 || result.errors.title ? "content" : "visual");
      return;
    }
    if (voiceEnabled && !tts) {
      setSubmitError("已开启配音，请先生成配音再导出。");
      setTab("voice");
      return;
    }
    if (voiceEnabled && voiceTooLong) {
      setSubmitError(
        `配音 ${audioDuration.toFixed(1)} 秒超过 15 秒上限，请缩短讲稿或拆成多个镜头后再导出。`,
      );
      setTab("voice");
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        ...result.value,
        name: videoName,
        durationMode,
        narration: previewProps.narration,
        subtitles: previewProps.subtitles,
        layers,
        durationInSeconds: previewProps.durationInSeconds,
      };
      const response = await fetch("/api/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as
        | { job?: PublicJob; errors?: VideoFieldErrors; message?: string }
        | null;
      if (!response.ok || !data?.job) {
        if (data?.errors) {
          setErrors(data.errors);
        }
        setSubmitError(data?.message ?? `创建渲染任务失败（HTTP ${response.status}）。`);
        return;
      }
      setJob(data.job);
      setSubmittedProps(payload as unknown as VideoProps);
    } catch {
      setSubmitError("无法连接渲染服务，请确认开发服务器仍在运行。");
    } finally {
      setSubmitting(false);
    }
  }, [
    values,
    isWorking,
    voiceEnabled,
    tts,
    voiceTooLong,
    audioDuration,
    videoName,
    durationMode,
    previewProps,
    layers,
  ]);

  const jobSize = job?.outputWidth && job?.outputHeight ? `${job.outputWidth}×${job.outputHeight}` : "—";
  const previewStatus = tts
    ? `${tts.voiceName} · ${tts.durationSeconds.toFixed(1)} 秒 · 语速 ${tts.speed.toFixed(2)}×`
    : voiceEnabled
      ? "已开启配音，等待生成"
      : "未启用配音";

  return (
    <>
      <SiteHeader
        view="generate"
        projectName={videoName || values.title || "未命名项目"}
        onOpenNav={onOpenNav}
        status={
          <span className={`status-pill ${statusKey}`} aria-live="polite">
            <i aria-hidden="true" />
            {job ? STATUS_TEXT[job.status] : "未开始"}
            {job?.status === "rendering" ? ` · ${progressPercent}%` : null}
          </span>
        }
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setZoomOpen(true)}>
              {icons.expand}
              放大预览
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void handleExport()}
              disabled={isWorking}
            >
              {isWorking ? <span className="spinner" aria-hidden="true" /> : icons.spark}
              {submitting ? "提交中…" : isBusy ? "导出中…" : "导出视频"}
            </button>
          </>
        }
      />

      <main className="page">
        <div className="page-head">
          <div>
            <h1 className="page-title">把知识讲清楚，也讲生动</h1>
            <p className="page-sub">写一段讲解稿，选画面与音色，字幕会跟着配音自动对齐。</p>
          </div>
          <div className="head-chips">
            <span className="chip neutral">{TEMPLATE_MAP[previewProps.template].name}</span>
            <span className="chip neutral">{RATIO_MAP[previewProps.ratio].id}</span>
            <span className="chip neutral">{formatClock(previewProps.durationInSeconds)}</span>
          </div>
        </div>

        <div className="tabs page-tabs" role="tablist" aria-label="设置分类">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`tab${tab === item.id ? " active" : ""}`}
              onClick={() => setTab(item.id)}
              title={item.hint}
            >
              {item.label}
              {item.id === "voice" && voiceEnabled ? <span className="tab-dot" aria-hidden="true" /> : null}
              {item.id === "layers" && layers.length > 0 ? <span className="tab-count">{layers.length}</span> : null}
            </button>
          ))}
        </div>

        {tab === "layers" ? (
          <div className="split split-editor">
            <aside className="card editor-card">
              <div className="card-head">
                <div className="card-title">
                  <h2>素材与图层</h2>
                  <span className="card-note">{layers.length} 个图层</span>
                </div>
              </div>
              <LayerAssetsPanel
                uploads={uploads}
                layers={layers}
                selectedId={selectedLayerId}
                uploading={uploading}
                uploadError={uploadError}
                onUpload={(files) => void uploadFiles(files)}
                onAddImage={addImageLayer}
                onAddText={addTextLayer}
                onSelect={setSelectedLayerId}
                onToggleHidden={(id) => toggleLayer(id, "hidden")}
                onToggleLocked={(id) => toggleLayer(id, "locked")}
                onMove={moveLayer}
                onDelete={deleteLayer}
              />
            </aside>

            <section className="card editor-stage">
              <div className="card-head">
                <div className="card-title">
                  <h2>编辑画布</h2>
                  <span className="card-note">
                    {RATIO_MAP[previewProps.ratio].id} · {previewSize.width}×{previewSize.height} ·{" "}
                    {editorPlaying ? "播放中（编辑框已隐藏）" : "拖动对齐画面中心"}
                  </span>
                </div>
                <div className="card-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setZoomOpen(true)}>
                    {icons.expand}
                    放大预览
                  </button>
                </div>
              </div>

              <div className="canvas editor-canvas">
                <PreviewPlayer
                  editing
                  inputProps={previewProps}
                  onPlayingChange={setEditorPlaying}
                  overlay={
                    <LayerOverlay
                      layers={layers}
                      selectedId={selectedLayerId}
                      canvas={previewSize}
                      playing={editorPlaying}
                      onSelect={setSelectedLayerId}
                      onChange={updateLayer}
                    />
                  }
                />
              </div>

              <div className="preview-meta">
                <span className="meta-item">
                  <span className="meta-label">图层</span>
                  <b>{layers.length}</b>
                  <span className="meta-weak">{layers.filter((l) => l.hidden).length} 个隐藏</span>
                </span>
                <span className="meta-item">
                  <span className="meta-label">时长</span>
                  <b>{formatClock(previewProps.durationInSeconds)}</b>
                  <span className="meta-weak">{durationFrames} 帧</span>
                </span>
                <span className="meta-item">
                  <span className="meta-label">选中</span>
                  <b>{selectedLayer?.name ?? "未选中图层"}</b>
                </span>
              </div>
            </section>

            <aside className="card editor-card inspector-card">
              <LayerInspector
                layer={selectedLayer}
                durationSeconds={previewProps.durationInSeconds}
                onChange={(patch) => {
                  if (selectedLayerId) {
                    updateLayer(selectedLayerId, patch);
                  }
                }}
              />
            </aside>
          </div>
        ) : (
        <div className="split">
          {/* 左：设置 */}
          <section className="card settings">
            <div className="settings-body">
              <form
                id={FORM_ID}
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleExport();
                }}
                noValidate
              >
                {tab === "content" ? (
                  <>
                    <div className="field">
                      <div className="label-row">
                        <label className="label" htmlFor="title">
                          标题
                        </label>
                        <span className="counter">
                          {countCharacters(values.title)}/{INPUT_LIMITS.titleMaxLength}
                        </span>
                      </div>
                      <input
                        id="title"
                        className={`input${errors.title ? " invalid" : ""}`}
                        value={values.title}
                        onChange={(event) => updateField("title", event.target.value)}
                        placeholder="例如：三步做出知识短视频"
                        maxLength={40}
                      />
                      {errors.title ? <p className="field-error">{errors.title}</p> : null}
                    </div>

                    <div className="field">
                      <div className="label-row">
                        <label className="label" htmlFor="video-name">
                          视频名称
                        </label>
                        <span className="counter">
                          {nameCount}/{VIDEO_NAME_MAX_LENGTH}
                        </span>
                      </div>
                      <input
                        id="video-name"
                        className="input"
                        value={videoName}
                        onChange={(event) => {
                          setNameTouched(true);
                          setVideoName(event.target.value);
                        }}
                        placeholder="默认使用标题"
                        maxLength={VIDEO_NAME_MAX_LENGTH + 20}
                      />
                      <p className="field-hint">
                        用于素材库与下载文件名；重名会自动加序号。
                        {safeName !== videoName.trim() ? ` 实际保存为：${safeName}` : ""}
                      </p>
                    </div>

                    {LINE_FIELDS.map((field, index) => (
                      <div className="field" key={field}>
                        <div className="label-row">
                          <label className="label" htmlFor={field}>
                            {LINE_LABELS[index]}文案
                          </label>
                          <span className="counter">
                            {countCharacters(values[field])}/{INPUT_LIMITS.lineMaxLength}
                          </span>
                        </div>
                        <textarea
                          id={field}
                          className={`textarea${errors[field] ? " invalid" : ""}`}
                          value={values[field]}
                          rows={2}
                          maxLength={120}
                          onChange={(event) => updateField(field, event.target.value)}
                          placeholder={`第 ${index + 1} 段要讲的要点`}
                        />
                        {errors[field] ? <p className="field-error">{errors[field]}</p> : null}
                      </div>
                    ))}
                  </>
                ) : null}

                {tab === "visual" ? (
                  <>
                    <div className="field">
                      <span className="label">画面模板</span>
                      <div className="template-grid" role="radiogroup" aria-label="画面模板">
                        {VIDEO_TEMPLATES.map((template) => {
                          const selected = values.template === template.id;
                          return (
                            <button
                              key={template.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              className={`template-card${selected ? " selected" : ""}`}
                              onClick={() => updateField("template", template.id as TemplateId)}
                            >
                              <span className="template-thumb">
                                <TemplateThumb template={template.id} />
                              </span>
                              <span className="template-meta">
                                <span className="template-name">{template.name}</span>
                                <span className="template-desc">{template.description}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="field">
                      <span className="label">画面比例</span>
                      <div className="ratio-grid" role="radiogroup" aria-label="画面比例">
                        {VIDEO_RATIOS.map((ratio) => {
                          const selected = values.ratio === ratio.id;
                          return (
                            <button
                              key={ratio.id}
                              type="button"
                              role="radio"
                              aria-checked={selected}
                              className={`ratio-card${selected ? " selected" : ""}`}
                              onClick={() => updateField("ratio", ratio.id as RatioId)}
                            >
                              <span
                                className="ratio-shape"
                                style={{
                                  width: Math.round((34 * ratio.width) / Math.max(ratio.width, ratio.height)),
                                  height: Math.round((34 * ratio.height) / Math.max(ratio.width, ratio.height)),
                                }}
                              />
                              <span className="ratio-text">
                                <strong>{ratio.id}</strong>
                                <span>
                                  {ratio.width}×{ratio.height}
                                </span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="field">
                      <div className="label-row">
                        <span className="label">时长</span>
                        <div className="duration-inputs">
                          <input
                            type="number"
                            className="input number-input"
                            min={DURATION_LIMITS.min}
                            max={DURATION_LIMITS.max}
                            value={durationInput}
                            onChange={(event) => {
                              setDurationInput(event.target.value);
                              const parsed = Number(event.target.value);
                              if (Number.isFinite(parsed) && parsed >= DURATION_LIMITS.min && parsed <= DURATION_LIMITS.max) {
                                updateField("durationInSeconds", Math.round(parsed * 2) / 2);
                              }
                            }}
                            disabled={durationMode === "voice" && Boolean(tts)}
                          />
                          <span className="unit">秒</span>
                        </div>
                      </div>
                      <input
                        type="range"
                        className="range"
                        min={DURATION_LIMITS.min}
                        max={DURATION_LIMITS.max}
                        step={1}
                        value={values.durationInSeconds}
                        disabled={durationMode === "voice" && Boolean(tts)}
                        onChange={(event) => updateField("durationInSeconds", Number(event.target.value))}
                      />
                      <p className="field-hint">
                        {durationFrames} 帧 · {VIDEO_CONFIG.fps}fps · 单段 {DURATION_LIMITS.min}–{DURATION_LIMITS.max} 秒
                      </p>

                      <label className="switch-row">
                        <span className="switch">
                          <input
                            type="checkbox"
                            checked={durationMode === "voice"}
                            onChange={(event) => {
                              const next = event.target.checked ? "voice" : "fixed";
                              setDurationMode(next);
                              if (next === "voice" && voiceDuration !== null) {
                                updateField("durationInSeconds", voiceDuration);
                              }
                            }}
                          />
                          <span className="switch-track" aria-hidden="true">
                            <span className="switch-thumb" />
                          </span>
                        </span>
                        <span className="switch-text">
                          <strong>跟随配音时长</strong>
                          <span>
                            {tts
                              ? `配音 ${audioDuration.toFixed(1)} 秒，画面将自动匹配`
                              : "生成配音后按实际讲解时间自动调整"}
                          </span>
                        </span>
                      </label>

                      {voiceEnabled && audioDuration > 0 ? (
                        <div className={`notice ${durationFit.status === "fit" ? "" : "warn"}`}>
                          <span>{durationFit.message}</span>
                          {durationFit.status === "longer" && voiceDuration !== null ? (
                            <button
                              type="button"
                              className="btn btn-ghost btn-sm"
                              onClick={() => {
                                setDurationMode("voice");
                                updateField("durationInSeconds", voiceDuration);
                              }}
                            >
                              延长至 {voiceDuration.toFixed(1)} 秒
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    <div className="field">
                      <span className="label">配色</span>
                      <div className="color-row">
                        <label className="color-field">
                          <span>背景</span>
                          <input
                            className="input hex-input"
                            value={values.backgroundColor}
                            onChange={(event) => updateField("backgroundColor", event.target.value)}
                          />
                          <input
                            type="color"
                            className="color-picker"
                            aria-label="选择背景色"
                            value={/^#[0-9a-fA-F]{6}$/.test(values.backgroundColor) ? values.backgroundColor : "#0B1120"}
                            onChange={(event) => updateField("backgroundColor", event.target.value.toUpperCase())}
                          />
                        </label>
                        <label className="color-field">
                          <span>强调</span>
                          <input
                            className="input hex-input"
                            value={values.accentColor}
                            onChange={(event) => updateField("accentColor", event.target.value)}
                          />
                          <input
                            type="color"
                            className="color-picker"
                            aria-label="选择强调色"
                            value={/^#[0-9a-fA-F]{6}$/.test(values.accentColor) ? values.accentColor : "#38BDF8"}
                            onChange={(event) => updateField("accentColor", event.target.value.toUpperCase())}
                          />
                        </label>
                      </div>
                      {errors.backgroundColor ? <p className="field-error">{errors.backgroundColor}</p> : null}
                      {errors.accentColor ? <p className="field-error">{errors.accentColor}</p> : null}
                    </div>
                  </>
                ) : null}

                {tab === "voice" ? (
                  <>
                    <label className="switch-row">
                      <span className="switch">
                        <input
                          type="checkbox"
                          checked={voiceEnabled}
                          onChange={(event) => setVoiceEnabled(event.target.checked)}
                        />
                        <span className="switch-track" aria-hidden="true">
                          <span className="switch-thumb" />
                        </span>
                      </span>
                      <span className="switch-text">
                        <strong>启用配音</strong>
                        <span>试听、预览与导出使用同一份音频</span>
                      </span>
                    </label>

                    {ttsConfig && !ttsConfig.configured ? (
                      <div className="notice warn">
                        <strong>配音服务未配置</strong>
                        <span>{ttsConfig.message}</span>
                      </div>
                    ) : ttsConfig ? (
                      <p className="field-hint">{ttsConfig.message}</p>
                    ) : null}

                    <div className="field">
                      <div className="label-row">
                        <label className="label" htmlFor="script">
                          讲解稿
                        </label>
                        <div className="label-actions">
                          <button
                            type="button"
                            className="btn-text"
                            onClick={() => {
                              setScriptTouched(false);
                              setScript(buildScriptFromLines(values.title, [values.line0, values.line1, values.line2]));
                            }}
                          >
                            从文案生成
                          </button>
                          <span className="counter">
                            {countCharacters(script)}/{NARRATION_LIMITS.scriptMaxLength}
                          </span>
                        </div>
                      </div>
                      <textarea
                        id="script"
                        className="textarea script-input"
                        rows={5}
                        value={script}
                        maxLength={NARRATION_LIMITS.scriptMaxLength + 60}
                        onChange={(event) => {
                          setScriptTouched(true);
                          setScript(event.target.value);
                        }}
                        placeholder="写成一句一句的口播稿，句末用句号，字幕会按句对齐。"
                      />
                      <p className="field-hint">
                        按句号、问号、逗号断句；每屏字幕不超过两行。单段 15 秒约 45–60 字，超长请拆镜头。
                      </p>
                    </div>

                    <div className="field">
                      <label className="label" htmlFor="voice">
                        音色
                      </label>
                      <select
                        id="voice"
                        className="input"
                        value={voiceId}
                        onChange={(event) => setVoiceId(event.target.value)}
                        disabled={voices.length === 0}
                      >
                        {voices.length === 0 ? <option value="">暂无可用音色</option> : null}
                        {voices.map((voice) => (
                          <option key={voice.id} value={voice.id}>
                            {voice.name} · {voice.lang}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="field">
                      <div className="label-row">
                        <label className="label" htmlFor="speed">
                          语速
                        </label>
                        <span className="value-badge">{speed.toFixed(2)}×</span>
                      </div>
                      <input
                        id="speed"
                        type="range"
                        className="range"
                        min={NARRATION_LIMITS.speedMin}
                        max={NARRATION_LIMITS.speedMax}
                        step={0.05}
                        value={speed}
                        onChange={(event) => setSpeed(Number(event.target.value))}
                      />
                      <p className="field-hint">0.75× 更从容，1.5× 更紧凑；不会为了塞进时长自动加速。</p>
                    </div>

                    <div className="field">
                      <div className="label-row">
                        <label className="label" htmlFor="volume">
                          音量
                        </label>
                        <span className="value-badge">{Math.round(volume * 100)}%</span>
                      </div>
                      <input
                        id="volume"
                        type="range"
                        className="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={volume}
                        onChange={(event) => setVolume(Number(event.target.value))}
                      />
                    </div>

                    <p className="field-hint">
                      生成后可在下方查看「配音已生成 · 时长 · 音色 · 句数」，并直接试听。
                    </p>
                  </>
                ) : null}

                {tab === "subtitle" ? (
                  <>
                    <label className="switch-row">
                      <span className="switch">
                        <input
                          type="checkbox"
                          checked={subtitleEnabled}
                          onChange={(event) => setSubtitleEnabled(event.target.checked)}
                        />
                        <span className="switch-track" aria-hidden="true">
                          <span className="switch-thumb" />
                        </span>
                      </span>
                      <span className="switch-text">
                        <strong>启用字幕</strong>
                        <span>默认渲染进画面，同时可下载 SRT</span>
                      </span>
                    </label>

                    {!tts ? (
                      <div className="notice">
                        生成配音后，这里会按每句真实时长列出字幕；先到「配音」标签生成音频。
                      </div>
                    ) : (
                      <div className="field">
                        <div className="label-row">
                          <span className="label">字幕文本（{subtitleCues.length} 屏）</span>
                          <a className="link" href={tts.srtUrl}>
                            下载 SRT
                          </a>
                        </div>
                        <div className="cue-list">
                          {subtitleCues.map((cue, index) => (
                            <div className="cue-item" key={`${tts.id}-${index}`}>
                              <span className="cue-time">
                                {formatClock(cue.startFrame / VIDEO_CONFIG.fps)}–
                                {formatClock(cue.endFrame / VIDEO_CONFIG.fps)}
                              </span>
                              <input
                                className="input cue-input"
                                value={subtitleTexts[index] ?? cue.text}
                                aria-label={`第 ${index + 1} 屏字幕`}
                                onChange={(event) => {
                                  const next = [...subtitleTexts];
                                  next[index] = event.target.value;
                                  setSubtitleTexts(next);
                                }}
                              />
                            </div>
                          ))}
                        </div>
                        <p className="field-hint">修改文字不会改变时间轴，字幕仍与配音同步。</p>
                      </div>
                    )}

                    <div className="field">
                      <div className="label-row">
                        <label className="label" htmlFor="font-scale">
                          字号
                        </label>
                        <span className="value-badge">{Math.round(fontScale * 100)}%</span>
                      </div>
                      <input
                        id="font-scale"
                        type="range"
                        className="range"
                        min={SUBTITLE_LIMITS.fontScaleMin}
                        max={SUBTITLE_LIMITS.fontScaleMax}
                        step={0.05}
                        value={fontScale}
                        onChange={(event) => setFontScale(Number(event.target.value))}
                      />
                    </div>

                    <div className="field">
                      <div className="label-row">
                        <label className="label" htmlFor="sub-bg">
                          半透明底色
                        </label>
                        <span className="value-badge">{Math.round(subtitleBg * 100)}%</span>
                      </div>
                      <input
                        id="sub-bg"
                        type="range"
                        className="range"
                        min={SUBTITLE_LIMITS.backgroundOpacityMin}
                        max={SUBTITLE_LIMITS.backgroundOpacityMax}
                        step={0.05}
                        value={subtitleBg}
                        onChange={(event) => setSubtitleBg(Number(event.target.value))}
                      />
                    </div>

                    <div className="field">
                      <span className="label">文字颜色</span>
                      <div className="color-row">
                        <label className="color-field">
                          <span>颜色</span>
                          <input
                            className="input hex-input"
                            value={subtitleColor}
                            onChange={(event) => setSubtitleColor(event.target.value)}
                          />
                          <input
                            type="color"
                            className="color-picker"
                            aria-label="字幕颜色"
                            value={/^#[0-9a-fA-F]{6}$/.test(subtitleColor) ? subtitleColor : "#FFFFFF"}
                            onChange={(event) => setSubtitleColor(event.target.value.toUpperCase())}
                          />
                        </label>
                      </div>
                    </div>

                    <div className="field">
                      <span className="label">位置</span>
                      <div className="segmented" role="radiogroup" aria-label="字幕位置">
                        <button
                          type="button"
                          role="radio"
                          aria-checked={subtitlePos === "bottom"}
                          className={subtitlePos === "bottom" ? "active" : ""}
                          onClick={() => setSubtitlePos("bottom")}
                        >
                          底部
                        </button>
                        <button
                          type="button"
                          role="radio"
                          aria-checked={subtitlePos === "lower"}
                          className={subtitlePos === "lower" ? "active" : ""}
                          onClick={() => setSubtitlePos("lower")}
                        >
                          中下部
                        </button>
                      </div>
                      <p className="field-hint">字幕保留安全边距，避让标题与图案区域。</p>
                    </div>
                  </>
                ) : null}
              </form>
            </div>

            <div className={`settings-foot${tab === "voice" ? " voice" : ""}`}>
              {tab === "voice" ? (
                <div className="voice-bar">
                  <div className="voice-actions">
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => void handleGenerateTts()}
                      disabled={ttsStatus === "loading" || !voiceId}
                    >
                      {ttsStatus === "loading" ? <span className="spinner" aria-hidden="true" /> : icons.mic}
                      {ttsStatus === "loading" ? "生成中…" : tts ? "重新生成配音" : "生成配音"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      onClick={() => void togglePreviewAudio()}
                      disabled={!tts}
                    >
                      {previewPlaying ? icons.pause : icons.play}
                      {previewPlaying ? "暂停试听" : "试听"}
                    </button>
                  </div>

                  {tts ? (
                    <audio
                      ref={voiceAudioRef}
                      className="audio-preview"
                      src={tts.audioUrl}
                      controls
                      onPlay={() => setPreviewPlaying(true)}
                      onPause={() => setPreviewPlaying(false)}
                      onEnded={() => setPreviewPlaying(false)}
                    />
                  ) : null}

                  {tts ? (
                    <div className="tts-status ready">
                      <span className="dot" aria-hidden="true" />
                      <span>
                        配音已生成 · {tts.durationSeconds.toFixed(1)} 秒 · {tts.voiceName} ·{" "}
                        {tts.chunkCount} 句 · 语速 {tts.speed.toFixed(2)}×
                      </span>
                      <a className="link" href={tts.srtUrl}>
                        下载 SRT
                      </a>
                    </div>
                  ) : ttsStatus === "loading" ? (
                    <div className="tts-status loading">
                      <span className="spinner dark" aria-hidden="true" />
                      正在逐句合成配音并测量时长…
                    </div>
                  ) : null}

                  {ttsStale ? (
                    <div className="notice warn">
                      讲稿、音色或语速已修改，请重新生成配音后再导出，否则成片仍是旧音频。
                    </div>
                  ) : null}

                  {ttsError ? (
                    <div className="alert error" role="alert">
                      {ttsError}
                    </div>
                  ) : null}

                  {tts ? (
                    <audio
                      ref={voiceAudioRef}
                      className="audio-preview"
                      src={tts.audioUrl}
                      controls
                      onPlay={() => setPreviewPlaying(true)}
                      onPause={() => setPreviewPlaying(false)}
                      onEnded={() => setPreviewPlaying(false)}
                    />
                  ) : null}
                </div>
              ) : null}

              {submitError ? (
                <div className="alert error" role="alert">
                  {submitError}
                </div>
              ) : null}
              {tab !== "voice" ? (
                <span className="foot-text">
                  参数即时同步到右侧预览 · 导出时渲染全部 {durationFrames} 帧
                </span>
              ) : null}
            </div>
          </section>

          {/* 右：预览与导出 */}
          <div className="stage-col">
            <section className="card preview-card">
              <div className="card-head">
                <div className="card-title">
                  <h2>预览</h2>
                  <span className="card-note">
                    {TEMPLATE_MAP[previewProps.template].name} · {RATIO_MAP[previewProps.ratio].id} ·{" "}
                    {previewSize.width}×{previewSize.height}
                  </span>
                </div>
                <div className="card-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setZoomOpen(true)}>
                    {icons.expand}
                    放大预览
                  </button>
                </div>
              </div>

              <div className="canvas">
                <PreviewPlayer inputProps={previewProps} />
              </div>

              <div className="preview-meta">
                <span className="meta-item">
                  <span className="meta-label">时长</span>
                  <b>{formatClock(previewProps.durationInSeconds)}</b>
                  <span className="meta-weak">{durationFrames} 帧</span>
                </span>
                <span className="meta-item">
                  <span className="meta-label">分辨率</span>
                  <b>
                    {previewSize.width}×{previewSize.height}
                  </b>
                  <span className="meta-weak">{VIDEO_CONFIG.fps}fps · H.264</span>
                </span>
                <span className="meta-item">
                  <span className="meta-label">配音</span>
                  <b className={tts ? "teal" : ""}>{previewStatus}</b>
                </span>
                <span className="meta-item">
                  <span className="meta-label">字幕</span>
                  <b>{subtitleEnabled && subtitleCues.length > 0 ? `${subtitleCues.length} 屏` : "未启用"}</b>
                </span>
              </div>
            </section>

            <section className="card export-card">
              <div className="card-head">
                <div className="card-title">
                  <h2>导出</h2>
                  <span className="card-note">串行队列 · 一次一个任务</span>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleExport()} disabled={isWorking}>
                  {isWorking ? <span className="spinner dark" aria-hidden="true" /> : null}
                  {isWorking ? "导出中…" : "导出视频"}
                </button>
              </div>

              <div className="export-body">
                <div className="status-row">
                  <span className={`status-pill ${statusKey}`}>
                    <i aria-hidden="true" />
                    {job ? STATUS_TEXT[job.status] : "尚未导出"}
                  </span>
                  <span className="status-detail">
                    {job
                      ? job.status === "queued"
                        ? `排队第 ${job.queuePosition || 1} 位 · ${job.totalFrames} 帧`
                        : job.status === "rendering"
                          ? `${job.renderedFrames}/${job.totalFrames} 帧`
                          : job.status === "success"
                            ? `${formatClock(job.totalFrames / VIDEO_CONFIG.fps)} · ${jobSize} · ${formatSize(job.fileSize ?? 0)}`
                            : `用时 ${((job.durationMs ?? 0) / 1000).toFixed(1)}s`
                      : "填好内容后点击导出，进度来自真实渲染"}
                  </span>
                </div>

                {job && isBusy ? (
                  <div className="progress" role="progressbar" aria-valuenow={progressPercent} aria-valuemin={0} aria-valuemax={100}>
                    <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
                  </div>
                ) : null}

                {pollError ? <p className="notice">{pollError}</p> : null}

                {job?.status === "failed" ? (
                  <div className="alert error" role="alert">
                    <strong>导出失败</strong>
                    <span>{job.error ?? "未知错误"}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleExport()}>
                      重试
                    </button>
                  </div>
                ) : null}

                {job?.status === "success" && job.videoUrl ? (
                  <div className="result">
                    <video className="result-video" src={job.videoUrl} controls playsInline preload="metadata" />
                    <div className="result-actions">
                      <a className="btn btn-primary" href={job.downloadUrl ?? job.videoUrl} download={job.name ? `${job.name}.mp4` : job.fileName}>
                        {icons.download}
                        下载 MP4
                      </a>
                      <button type="button" className="btn btn-ghost" onClick={() => onNavigate("merge")}>
                        去拼接
                      </button>
                    </div>
                    <p className="result-note">
                      名称：{job.name ?? "—"} · 文件：output/{job.fileName}
                    </p>
                  </div>
                ) : null}

                {!job ? (
                  <div className="hint-line">
                    导出后这里会显示成片、真实进度与下载入口；单段时长 5–15 秒。
                  </div>
                ) : null}
              </div>
            </section>
          </div>
        </div>
        )}
      </main>

      <VideoLightbox open={zoomOpen} title={videoName || values.title} onClose={() => setZoomOpen(false)}>
        <PreviewPlayer inputProps={previewProps} />
      </VideoLightbox>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}