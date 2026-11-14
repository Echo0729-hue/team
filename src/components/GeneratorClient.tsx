"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import PreviewPlayer from "./PreviewPlayer";
import SiteHeader from "./SiteHeader";
import Toast from "./Toast";
import TemplateThumb from "./TemplateThumb";
import VideoLightbox, { type VideoLightboxHandle } from "./VideoLightbox";
import ResultVideo from "./ResultVideo";
import DownloadVideo from "./DownloadVideo";
import SpotlightCard from "./react-bits/SpotlightCard";
import AnimatedContent from "./react-bits/AnimatedContent";
import LayerOverlay from "./LayerOverlay";
import EffectWorkspace from "./EffectWorkspace";
import { useManimAssets } from "./useManimAssets";
import { useDraftField, useEditorDraft } from "./useEditorDraft";
import { LayerAssetsPanel, LayerInspector, type UploadItem } from "./LayerPanels";
import type { PublicJob } from "@/lib/jobs";
import type { TtsResult, VoiceOption } from "@/lib/tts/types";
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
  toPreviewProps,
  validateFormValues,
  type RatioId,
  type TemplateId,
  type VideoFieldErrors,
  type VideoFormValues,
  type VideoProps,
} from "@/remotion/params";
import { sanitizeEffects } from "@/remotion/effects";
import {
  NARRATION_LIMITS,
  buildScriptFromLines,
  describeDurationFit,
  resolveDurationFromAudio,
  narrationContentKey,
  normalizeScript,
  parseNarrationScenes,
  sanitizeNarrationScenes,
  type DurationMode,
} from "@/remotion/narration";
import { SUBTITLE_LIMITS, cuesToSrt, wrapSubtitleText, type SubtitlePosition } from "@/remotion/subtitles";
import { VIDEO_NAME_MAX_LENGTH, sanitizeVideoName, toDownloadFileName } from "@/lib/videoName";
import {
  createImageLayer,
  createTextLayer,
  LAYER_LIMITS,
  sanitizeLayers,
  type ImageLayer,
  type Layer,
  type TextLayer,
} from "@/remotion/layers";
import type { WorkbenchView } from "./Workbench";
import type { EditorDraft } from "@/lib/projectDraft";

type TabId = "content" | "visual" | "layers" | "effects" | "voice" | "subtitle";



type GeneratorClientProps = {
  active: boolean;
  onNavigate: (view: WorkbenchView) => void;
  onOpenNav: () => void;
  demoDraft?: { key: string; initial: EditorDraft; fresh?: boolean };
};

const LINE_FIELDS = ["line0", "line1", "line2"] as const;
const LINE_LABELS = ["第一段", "第二段", "第三段"];
const FORM_ID = "video-settings-form";

const TABS: { id: TabId; label: string; hint: string }[] = [
  { id: "content", label: "内容", hint: "标题、文案与名称" },
  { id: "visual", label: "画面", hint: "模板、比例、时长" },
  { id: "layers", label: "图层", hint: "图片与文字排版" },
  { id: "effects", label: "效果", hint: "五类效果组件与时间轴" },
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

export default function GeneratorClient({ active, onNavigate, onOpenNav, demoDraft }: GeneratorClientProps) {
  const { draft, setDraft, ready: draftReady, storageMessage, restoredTtsId } = useEditorDraft(demoDraft);
  const [tab, setTab] = useDraftField(draft, setDraft, "tab");
  const [values, setValues] = useDraftField(draft, setDraft, "values");
  const [errors, setErrors] = useState<VideoFieldErrors>({});
  const [job, setJob] = useState<PublicJob | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const [jobId, setJobId] = useDraftField(draft, setDraft, "jobId");
  const [, setTtsId] = useDraftField(draft, setDraft, "ttsId");
  const [restoringTts, setRestoringTts] = useState(false);
  const [durationInput, setDurationInput] = useState(String(DEFAULT_VIDEO_PROPS.durationInSeconds));
  const [videoName, setVideoName] = useDraftField(draft, setDraft, "videoName");
  const [nameTouched, setNameTouched] = useDraftField(draft, setDraft, "nameTouched");
  const [zoomOpen, setZoomOpen] = useState(false);
  const zoomRef = useRef<VideoLightboxHandle>(null);
  const openPreviewFullscreen = () => {
    flushSync(() => setZoomOpen(true));
    void zoomRef.current?.enterFullscreen();
  };
  const [resultOpen, setResultOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // ---------------- 配音 ----------------
  const [voiceEnabled, setVoiceEnabled] = useDraftField(draft, setDraft, "voiceEnabled");
  const [script, setScript] = useDraftField(draft, setDraft, "script");
  const [scriptTouched, setScriptTouched] = useDraftField(draft, setDraft, "scriptTouched");
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [ttsConfig, setTtsConfig] = useState<TtsConfig | null>(null);
  const [voiceId, setVoiceId] = useDraftField(draft, setDraft, "voiceId");
  const [speed, setSpeed] = useDraftField(draft, setDraft, "speed");
  const [volume, setVolume] = useDraftField(draft, setDraft, "volume");
  const [tts, setTts] = useDraftField(draft, setDraft, "tts");
  const [ttsStatus, setTtsStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [ttsError, setTtsError] = useState<string | null>(null);
  const [durationMode, setDurationMode] = useDraftField(draft, setDraft, "durationMode");
  const [previewPlaying, setPreviewPlaying] = useState(false);
  const voiceAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!active || zoomOpen || resultOpen) {
      voiceAudioRef.current?.pause();
    }
    if (!active) {
      setZoomOpen(false);
    }
  }, [active, zoomOpen, resultOpen]);

  // ---------------- 字幕 ----------------
  const [subtitleEnabled, setSubtitleEnabled] = useDraftField(draft, setDraft, "subtitleEnabled");
  const [subtitleTexts, setSubtitleTexts] = useDraftField(draft, setDraft, "subtitleTexts");
  const [fontScale, setFontScale] = useDraftField(draft, setDraft, "fontScale");
  const [subtitleColor, setSubtitleColor] = useDraftField(draft, setDraft, "subtitleColor");
  const [subtitleBg, setSubtitleBg] = useDraftField(draft, setDraft, "subtitleBg");
  const [subtitlePos, setSubtitlePos] = useDraftField(draft, setDraft, "subtitlePos");

  const pollTimer = useRef<number | null>(null);

  // ---------------- 图层 ----------------
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [layers, setLayers] = useDraftField(draft, setDraft, "layers");
  const [selectedLayerId, setSelectedLayerId] = useDraftField(draft, setDraft, "selectedLayerId");
  const [effects, setEffects] = useDraftField(draft, setDraft, "effects");
  const [selectedEffectId, setSelectedEffectId] = useDraftField(draft, setDraft, "selectedEffectId");
  const manim = useManimAssets(effects, draftReady);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [editorPlaying, setEditorPlaying] = useState(false);

  // 支持 ?tab=voice 这类深链，方便分享与验收
  useEffect(() => {
      if (!draftReady) return;
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "content" || requested === "visual" || requested === "layers" || requested === "effects" || requested === "voice" || requested === "subtitle") {
      setTab(requested);
    }
  }, [draftReady]);

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
    if (draftReady && !nameTouched) {
      setVideoName(values.title);
    }
  }, [values.title, nameTouched, draftReady]);

  // 讲稿默认跟随文案，用户改过后不再覆盖
  useEffect(() => {
    if (draftReady && !scriptTouched) {
      setScript(buildScriptFromLines(values.title, [values.line0, values.line1, values.line2]));
    }
  }, [values.title, values.line0, values.line1, values.line2, scriptTouched, draftReady]);

  useEffect(() => {
    setDurationInput(String(values.durationInSeconds));
  }, [values.durationInSeconds]);

  // 音色列表
  useEffect(() => {
    if (!draftReady) return;
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
        setVoiceId((previous) => previous || (list[0]?.id ?? ""));
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
  }, [draftReady, setVoiceId]);

  useEffect(() => {
    if (!draftReady || !restoredTtsId) return;
    const controller = new AbortController();
    setRestoringTts(true);
    const restore = async () => {
      try {
        const response = await fetch(`/api/tts/${restoredTtsId}`, { cache: "no-store", signal: controller.signal });
        const data = await response.json();
        if (controller.signal.aborted) return;
        if (!response.ok || !data.tts) {
          setTtsError(data.message ?? "配音无法恢复，草稿已保留，请重新生成配音。");
          if (response.status === 404) setTtsId(null);
          return;
        }
        setTts(data.tts);
        setTtsStatus("ready");
      } catch {
        if (!controller.signal.aborted) setTtsError("配音读取失败，草稿已保留；请重试或重新生成配音。");
      } finally {
        if (!controller.signal.aborted) setRestoringTts(false);
      }
    };
    void restore();
    return () => controller.abort();
  }, [draftReady, restoredTtsId, setTts, setTtsId]);

  useEffect(() => {
    if (!draftReady || !jobId) return;
    const controller = new AbortController();
    void fetch(`/api/jobs/${jobId}`, { cache: "no-store", signal: controller.signal }).then(async (response) => {
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (response.ok && data.job) setJob(data.job);
      else if (response.status === 404) {
        setJobId(null);
        setPollError("上次导出任务已失效，草稿已保留；已完成的视频可在素材库查看。");
      } else setPollError("暂时无法恢复导出状态，草稿已保留。");
    }).catch(() => { if (!controller.signal.aborted) setPollError("暂时无法恢复导出状态，草稿已保留。"); });
    return () => controller.abort();
  }, [draftReady, jobId, setJobId]);

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
          if (response.status === 404) {
            setJob(null);
            setJobId(null);
            setPollError("导出任务已失效，草稿已保留，请重新导出。");
            return;
          }
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
  }, [job?.id, job?.status, setJobId]);

  const selectedVoice = voices.find((voice) => voice.id === voiceId) ?? null;
  const audioDuration = tts?.durationSeconds ?? 0;
  const content = { title: values.title, lines: [values.line0, values.line1, values.line2] };
  const ttsStale = Boolean(tts) && (tts?.script !== normalizeScript(script) || tts?.voiceId !== voiceId ||
    Math.abs((tts?.speed ?? 0) - speed) > 0.001 || tts?.contentKey !== narrationContentKey(content) ||
    sanitizeNarrationScenes(tts?.scenes).length !== 4);
  const durationFit = describeDurationFit(audioDuration, values.durationInSeconds);
  const voiceDuration = audioDuration > 0 ? resolveDurationFromAudio(audioDuration) : null;
  const voiceTooLong = audioDuration > DURATION_LIMITS.max;

  // 预览时长（跟随配音时用音频时长），字幕不能超出这一范围
  const resolvedPreviewSeconds =
    voiceEnabled && !ttsStale && durationMode === "voice" && voiceDuration !== null ? voiceDuration : values.durationInSeconds;
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

  const [subtitleDownloadUrl, setSubtitleDownloadUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!subtitleCues.length || ttsStale || restoringTts) {
      setSubtitleDownloadUrl(null);
      return;
    }
    const url = URL.createObjectURL(new Blob([cuesToSrt(subtitleCues, VIDEO_CONFIG.fps)], { type: "text/plain;charset=utf-8" }));
    setSubtitleDownloadUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [subtitleCues, ttsStale, restoringTts]);

  const previewProps = useMemo<VideoProps>(() => {
    const base = toPreviewProps(values);
    const seconds = resolvedPreviewSeconds;
    const narrationEnabled = voiceEnabled && Boolean(tts) && !ttsStale && !restoringTts;
    return {
      ...base,
      durationInSeconds: seconds,
      durationMode: narrationEnabled ? durationMode : "fixed",
      narration: {
        enabled: narrationEnabled,
        ttsId: tts?.id ?? null,
        audioSrc: tts?.audioUrl ?? null,
        script,
        voiceId: voiceId || null,
        voiceName: selectedVoice?.name ?? tts?.voiceName ?? null,
        provider: (tts?.provider as VideoProps["narration"]["provider"]) ?? null,
        speed,
        volume,
        audioDurationSeconds: audioDuration,
        scenes: tts?.scenes ?? [],
      },
      layers: sanitizeLayers(layers, Math.round(seconds * VIDEO_CONFIG.fps)),
      effects: sanitizeEffects(effects, Math.round(seconds * VIDEO_CONFIG.fps)),
      manimAssets: manim.assets,
      subtitles: {
        enabled: subtitleEnabled && subtitleCues.length > 0 && !ttsStale && !restoringTts,
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
    ttsStale,
    restoringTts,
    voiceId,
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
    effects,
    manim.assets,
  ]);

  const selectedLayer = layers.find((layer) => layer.id === selectedLayerId) ?? null;
  const isBusy = job?.status === "queued" || job?.status === "rendering";
  const isWorking = submitting || isBusy;
  const exportBlocked = isWorking || !draftReady || (voiceEnabled && (!tts || ttsStale || restoringTts || ttsStatus === "loading"));
  const progressPercent = Math.round((job?.progress ?? 0) * 100);
  const statusKey = job ? job.status : "idle";
  const durationFrames = getDurationInFrames(previewProps);
  const previewSize = getVideoSize(previewProps);
  const nameCount = countCharacters(videoName);
  const safeName = sanitizeVideoName(videoName, values.title);

  const handleGenerateTts = useCallback(async () => {
    if (!parseNarrationScenes(script)) {
      setTtsError("讲解稿请分成四段，依次对应标题、第一段、第二段和第三段，每段另起一行。");
      setTtsStatus("error");
      return;
    }
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
        body: JSON.stringify({ script, voiceId, speed, content: { title: values.title, lines: [values.line0, values.line1, values.line2] } }),
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
      setTtsId(data.tts.id);
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
  }, [script, voiceId, speed, values, setTts, setTtsId, setSubtitleTexts, setVoiceEnabled]);

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
      if (layers.length >= LAYER_LIMITS.maxLayers) {
        setUploadError(`最多添加 ${LAYER_LIMITS.maxLayers} 个图层，请先删除不需要的图层。`);
        return;
      }
      const canvas = getVideoSize(previewProps);
      const layer = createImageLayer(upload, canvas, {
        endFrame: getDurationInFrames(previewProps),
      });
      setLayers((previous) => [...previous, layer]);
      setSelectedLayerId(layer.id);
    },
    [previewProps, layers.length],
  );

  const addTextLayer = useCallback(() => {
    if (layers.length >= LAYER_LIMITS.maxLayers) {
      setUploadError(`最多添加 ${LAYER_LIMITS.maxLayers} 个图层，请先删除不需要的图层。`);
      return;
    }
    const layer = createTextLayer({ endFrame: getDurationInFrames(previewProps) });
    setLayers((previous) => [...previous, layer]);
    setSelectedLayerId(layer.id);
  }, [previewProps, layers.length]);

  const deleteUpload = useCallback(async (upload: UploadItem) => {
    if (layers.some((layer) => layer.kind === "image" && layer.src === upload.url)) {
      setUploadError("图片仍在当前画面中使用，请先删除对应图层再删除图片素材。");
      return;
    }
    if (!window.confirm(`删除图片「${upload.name}」？其它浏览器中的草稿如使用该图片，将需要重新上传。`)) return;
    try {
      const response = await fetch(upload.url, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok || !data.deleted) { setUploadError(data.message ?? "删除图片失败，请重试。"); return; }
      setUploads((previous) => previous.filter((item) => item.id !== upload.id));
      setUploadError(null);
    } catch { setUploadError("无法连接服务器，图片未删除。"); }
  }, [layers]);

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
    if (isWorking || !draftReady) {
      return;
    }
    if (voiceEnabled && (ttsStale || restoringTts || ttsStatus === "loading")) {
      setSubmitError("配音正在生成或已过期，请重新生成有效配音后导出。");
      setTab("voice");
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
        effects,
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
      setJobId(data.job.id);
    } catch {
      setSubmitError("无法连接渲染服务，请确认开发服务器仍在运行。");
    } finally {
      setSubmitting(false);
    }
  }, [
    values,
    isWorking,
    draftReady,
    ttsStale,
    restoringTts,
    ttsStatus,
    voiceEnabled,
    tts,
    voiceTooLong,
    audioDuration,
    videoName,
    durationMode,
    previewProps,
    layers,
    effects,
    setJobId,
    setTab,
  ]);

  const jobSize = job?.outputWidth && job?.outputHeight ? `${job.outputWidth}×${job.outputHeight}` : "—";
  const previewStatus = tts
    ? `${tts.voiceName} · ${tts.durationSeconds.toFixed(1)} 秒 · 语速 ${tts.speed.toFixed(2)}×`
    : voiceEnabled
      ? "已开启配音，等待生成"
      : "未启用配音";

  const exportPanel = (<section className="card export-card">
              <div className="card-head">
                <div className="card-title">
                  <h2>导出</h2>
                  <span className="card-note">串行队列 · 一次一个任务</span>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => void handleExport()} disabled={exportBlocked}>
                  {isWorking ? <span className="spinner dark" aria-hidden="true" /> : null}
                  {isWorking ? "导出中…" : "导出视频"}
                </button>
              </div>

              <div className="export-body">
                {submitError ? <p className="notice warn" role="alert">{submitError}</p> : null}
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
                    <ResultVideo key={job.id} src={job.videoUrl} title={job.name ?? values.title}
                      active={active && !zoomOpen} onExpandedChange={setResultOpen}>
                      <DownloadVideo id={job.id} name={job.name ?? values.title} className="btn btn-primary" href={job.downloadUrl ?? job.videoUrl}>
                        {icons.download}
                        下载 MP4
                      </DownloadVideo>
                      <button type="button" className="btn btn-ghost" onClick={() => onNavigate("merge")}>
                        去拼接
                      </button>
                    </ResultVideo>
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
            </section>);

  if (!draftReady) return <main className="page"><p role="status">正在恢复编辑草稿…</p></main>;

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
              disabled={exportBlocked}
            >
              {isWorking ? <span className="spinner" aria-hidden="true" /> : icons.spark}
              {submitting ? "提交中…" : isBusy ? "导出中…" : "导出视频"}
            </button>
          </>
        }
      />

      <main className="page generator-page" data-editor-tab={tab}>
        <AnimatedContent className="page-head" active={active}>
          <div>
            <h1 className="page-title">把知识讲清楚，也讲生动</h1>
            <p className="page-sub">写一段讲解稿，选画面与音色，字幕会跟着配音自动对齐。</p>
          </div>
          <div className="head-chips">
            <span className="chip neutral">{TEMPLATE_MAP[previewProps.template].name}</span>
            <span className="chip neutral">{RATIO_MAP[previewProps.ratio].id}</span>
            <span className="chip neutral">{formatClock(previewProps.durationInSeconds)}</span>
          </div>
        </AnimatedContent>

        <div className="editor-toolbar">
        <div className="tabs page-tabs" role="tablist" aria-label="设置分类">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              id={`setting-tab-${item.id}`}
              aria-controls="generator-settings-panel"
              aria-selected={tab === item.id}
              tabIndex={tab === item.id ? 0 : -1}
              className={`tab${tab === item.id ? " active" : ""}`}
              onClick={() => setTab(item.id)}
              onKeyDown={(event) => {
                const offset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
                const index = TABS.findIndex((entry) => entry.id === item.id);
                const next = event.key === "Home" ? TABS[0] : event.key === "End" ? TABS[TABS.length - 1] : offset ? TABS[(index + offset + TABS.length) % TABS.length] : null;
                if (!next) return;
                event.preventDefault();
                setTab(next.id);
                document.getElementById(`setting-tab-${next.id}`)?.focus();
              }}
              title={item.hint}
            >
              {item.label}
              {item.id === "voice" && voiceEnabled ? <span className="tab-dot" aria-hidden="true" /> : null}
              {item.id === "layers" && layers.length > 0 ? <span className="tab-count">{layers.length}</span> : null}
              {item.id === "effects" && effects.length > 0 ? <span className="tab-count">{effects.length}</span> : null}
            </button>
          ))}
        </div>
        <p className="draft-status" role="status"><span aria-hidden="true" />{storageMessage}{restoringTts ? " · 正在恢复配音…" : ""}</p>
        </div>

        {voiceEnabled && ttsStale ? (
          <div className="notice warn" role="alert">
            文案、讲稿、音色或语速已修改，配音已过期，暂时无法导出。
            <button type="button" className="btn-text" onClick={() => setTab("voice")}>去重新生成配音</button>
          </div>
        ) : null}

        <div id="generator-settings-panel" role="tabpanel" aria-labelledby={`setting-tab-${tab}`} className="workspace-panel">
        {tab === "effects" ? (
          <EffectWorkspace effects={effects} setEffects={setEffects} selectedId={selectedEffectId} onSelect={setSelectedEffectId}
            previewProps={previewProps} active={active && !zoomOpen && !resultOpen} onFullscreen={openPreviewFullscreen} exportContent={exportPanel} manimJobs={manim.jobs} onRetryManim={manim.retry} />
        ) : tab === "layers" ? (
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
                onDeleteUpload={(upload) => void deleteUpload(upload)}
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
                  active={active && !zoomOpen && !resultOpen}
                  onRequestFullscreen={openPreviewFullscreen}
                  editing
                  inputProps={previewProps}
                  onPlayingChange={setEditorPlaying}
                  overlay={
                    <LayerOverlay
                      layers={previewProps.layers}
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
                canvas={previewSize}
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
            <div className="card-head settings-heading"><div className="card-title"><h2>{TABS.find((item) => item.id === tab)?.label}设置</h2><span className="card-note">{TABS.find((item) => item.id === tab)?.hint}</span></div></div>
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
                            <SpotlightCard
                              key={template.id}
                              as="button"
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
                            </SpotlightCard>
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
                            disabled={durationMode === "voice" && previewProps.narration.enabled}
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
                        disabled={durationMode === "voice" && previewProps.narration.enabled}
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
                        placeholder={"标题讲解\n第一段讲解\n第二段讲解\n第三段讲解"}
                      />
                      <p className="field-hint">
                        分成四段，每段另起一行，依次对应标题和三段正文。画面与字幕跟随每段实际配音时间；15 秒约 45–60 字。
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
                        {voiceId && !voices.some((voice) => voice.id === voiceId) ? <option value={voiceId}>{tts?.voiceName ?? voiceId}（当前不可生成）</option> : null}
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
                          <a className="link" href={subtitleDownloadUrl ?? undefined} download={toDownloadFileName(videoName, ".srt")} aria-disabled={!subtitleDownloadUrl}>
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
                      disabled={ttsStatus === "loading" || restoringTts || !voiceId}
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
                      <a className="link" href={subtitleDownloadUrl ?? undefined} download={toDownloadFileName(videoName, ".srt")} aria-disabled={!subtitleDownloadUrl}>
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
                      配音已过期，请重新生成；更新前导出已暂停。
                    </div>
                  ) : null}

                  {ttsError ? (
                    <div className="alert error" role="alert">
                      {ttsError}
                    </div>
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
                <PreviewPlayer active={active && !zoomOpen && !resultOpen} inputProps={previewProps} onRequestFullscreen={openPreviewFullscreen} />
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

            {exportPanel}
          </div>
        </div>
        )}
        </div>
      </main>

      <VideoLightbox ref={zoomRef} open={zoomOpen} title={videoName || values.title} onClose={() => setZoomOpen(false)}>
        <PreviewPlayer active={active && zoomOpen} inputProps={previewProps} />
      </VideoLightbox>

      <Toast message={toast} onDone={() => setToast(null)} />
    </>
  );
}
