"use client";

import { useCallback, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";

export type VideoLightboxHandle = { enterFullscreen: () => Promise<void> };

type VideoLightboxProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  ref?: Ref<VideoLightboxHandle>;
};

type FullscreenDocument = Document & {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => Promise<void> | void;
};
type FullscreenPanel = HTMLDivElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};
type FullscreenVideo = HTMLVideoElement & {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
};

const fullscreenElement = () => document.fullscreenElement || (document as FullscreenDocument).webkitFullscreenElement;
const fullscreenVideo = (panel: HTMLDivElement) => panel.querySelector<FullscreenVideo>(".lightbox-video");
const ownsFullscreen = (panel: HTMLDivElement) => {
  const element = fullscreenElement();
  return Boolean((element && panel.contains(element)) || fullscreenVideo(panel)?.webkitDisplayingFullscreen);
};
const exitFullscreen = async (panel: HTMLDivElement) => {
  if (!ownsFullscreen(panel)) return;
  const doc = document as FullscreenDocument;
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (doc.webkitFullscreenElement) await doc.webkitExitFullscreen?.();
  else fullscreenVideo(panel)?.webkitExitFullscreen?.();
};

/** Native fullscreen where available; otherwise keep a usable, viewport-filling player. */
export default function VideoLightbox({ open, title, onClose, children, ref }: VideoLightboxProps) {
  const panelRef = useRef<FullscreenPanel>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [nativeFullscreen, setNativeFullscreen] = useState(false);
  const [pageFullscreen, setPageFullscreen] = useState(false);
  const isFullscreen = nativeFullscreen || pageFullscreen;

  const enterFullscreen = useCallback(async () => {
    const panel = panelRef.current;
    if (!panel) return;
    // Embedded browsers can expose the API but reject it via permissions policy.
    // Keep the expanded player usable while requesting native fullscreen and on rejection.
    setPageFullscreen(true);
    try {
      if (!ownsFullscreen(panel)) {
        if (document.fullscreenEnabled !== false && panel.requestFullscreen) await panel.requestFullscreen();
        else if (panel.webkitRequestFullscreen) await panel.webkitRequestFullscreen();
        else {
          const video = fullscreenVideo(panel);
          if (!video?.webkitEnterFullscreen) return;
          video.webkitEnterFullscreen();
        }
      }
      if (panelRef.current === panel) {
        setNativeFullscreen(ownsFullscreen(panel));
        if (ownsFullscreen(panel)) setPageFullscreen(false);
      } else await exitFullscreen(panel);
    } catch {
      // Page fullscreen remains available when the native request is denied.
    }
  }, []);

  useImperativeHandle(ref, () => ({ enterFullscreen }), [enterFullscreen]);

  const leaveFullscreen = useCallback(() => {
    setPageFullscreen(false);
    const panel = panelRef.current;
    if (panel) void exitFullscreen(panel).catch(() => undefined);
  }, []);

  // Follow native Esc, video controls, and Safari's video fullscreen events.
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const video = fullscreenVideo(panel);
    const sync = () => {
      const native = ownsFullscreen(panel);
      setNativeFullscreen(native);
      if (native) setPageFullscreen(false);
    };
    document.addEventListener("fullscreenchange", sync);
    document.addEventListener("webkitfullscreenchange", sync);
    video?.addEventListener("webkitbeginfullscreen", sync);
    video?.addEventListener("webkitendfullscreen", sync);
    sync();
    return () => {
      document.removeEventListener("fullscreenchange", sync);
      document.removeEventListener("webkitfullscreenchange", sync);
      video?.removeEventListener("webkitbeginfullscreen", sync);
      video?.removeEventListener("webkitendfullscreen", sync);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previousFocus = document.activeElement;
    panel?.querySelector<HTMLButtonElement>(".lightbox-close")?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
      setNativeFullscreen(false);
      setPageFullscreen(false);
      const restoreFocus = () => {
        if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
      };
      // The browser restores its own focus during native exit; restore ours afterward.
      if (panel) void exitFullscreen(panel).catch(() => undefined).then(restoreFocus);
      else restoreFocus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const nodes = Array.from(panelRef.current?.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, video[controls], [tabindex="0"]') ?? [])
          .filter((node) => !node.hasAttribute("disabled") && node.getClientRects().length > 0);
        const first = nodes[0];
        const last = nodes.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (pageFullscreen || (panelRef.current && ownsFullscreen(panelRef.current))) leaveFullscreen();
      else closeRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, pageFullscreen, leaveFullscreen]);

  if (!open) return null;

  // Keep the fixed overlay outside cards, transformed surfaces and clipped workspaces.
  return createPortal(
    <div
      className={`lightbox${pageFullscreen ? " is-page-fullscreen" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="lightbox-panel" ref={panelRef}>
        <div className="lightbox-head">
          <span className="lightbox-title" title={title}>{title}</span>
          <div className="lightbox-tools">
            <button type="button" className="btn-text" aria-pressed={isFullscreen}
              onClick={() => isFullscreen ? leaveFullscreen() : void enterFullscreen()}>
              {isFullscreen ? "退出全屏" : "全屏"}
            </button>
            <button type="button" className="lightbox-close" aria-label="关闭预览" onClick={onClose}>✕</button>
          </div>
        </div>
        <div className="lightbox-stage">{children}</div>
        <p className="lightbox-hint">
          {pageFullscreen ? "网页全屏 · Esc 或点击退出全屏返回" : "Esc 或点击遮罩关闭 · 支持播放、暂停、拖动进度与调节音量"}
        </p>
      </div>
    </div>, document.body
  );
}
