"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

type VideoLightboxProps = {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
};

/**
 * 大尺寸预览层：居中浮层 + 遮罩 + 关闭按钮 + Esc 关闭。
 * 浏览器支持 Fullscreen API 时额外提供全屏按钮；不支持时放大预览照常可用。
 */
export default function VideoLightbox({ open, title, onClose, children }: VideoLightboxProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [supportsFullscreen, setSupportsFullscreen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setSupportsFullscreen(
      typeof document !== "undefined" && Boolean(document.fullscreenEnabled && Element.prototype.requestFullscreen),
    );
  }, []);

  // Esc 关闭（全屏状态下先退出全屏）+ 锁背景滚动
  useEffect(() => {
    if (!open) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      if (document.fullscreenElement) {
        void document.exitFullscreen().catch(() => undefined);
        return;
      }
      event.stopPropagation();
      onClose();
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    const element = panelRef.current;
    if (!element) {
      return;
    }
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await element.requestFullscreen();
      }
      setError(null);
    } catch {
      setError("浏览器拒绝进入全屏，已保留放大预览。");
    }
  }, []);

  if (!open) {
    return null;
  }

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="lightbox-panel" ref={panelRef}>
        <div className="lightbox-head">
          <span className="lightbox-title" title={title}>
            {title}
          </span>
          <div className="lightbox-tools">
            {supportsFullscreen ? (
              <button type="button" className="btn-text" onClick={() => void toggleFullscreen()}>
                {isFullscreen ? "退出全屏" : "全屏"}
              </button>
            ) : null}
            <button type="button" className="lightbox-close" aria-label="关闭预览" onClick={onClose}>
              ✕
            </button>
          </div>
        </div>

        <div className="lightbox-stage">{children}</div>

        {error ? <p className="lightbox-error">{error}</p> : null}
        <p className="lightbox-hint">Esc 或点击遮罩关闭 · 支持播放、暂停、拖动进度与调节音量</p>
      </div>
    </div>
  );
}