"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import VideoLightbox, { type VideoLightboxHandle } from "./VideoLightbox";

type Playback = { time: number; volume: number; muted: boolean; rate: number };
const readPlayback = (video: HTMLVideoElement): Playback => ({
  time: video.currentTime, volume: video.volume, muted: video.muted, rate: video.playbackRate,
});
const restorePlayback = (video: HTMLVideoElement, playback: Playback) => {
  video.volume = playback.volume;
  video.muted = playback.muted;
  video.playbackRate = playback.rate;
  video.currentTime = Math.min(playback.time, Number.isFinite(video.duration) ? video.duration : playback.time);
};

/** A separate fullscreen entry stays available when embedded native controls omit it. */
export default function ResultVideo({ src, title, active, onExpandedChange, children }: {
  src: string;
  title: string;
  active: boolean;
  onExpandedChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const inlineRef = useRef<HTMLVideoElement>(null);
  const lightboxRef = useRef<VideoLightboxHandle>(null);
  const expandedRef = useRef<HTMLVideoElement>(null);
  const playbackRef = useRef<Playback>({ time: 0, volume: 1, muted: false, rate: 1 });
  const [open, setOpen] = useState(false);

  const close = useCallback(() => {
    if (expandedRef.current) {
      playbackRef.current = readPlayback(expandedRef.current);
      expandedRef.current.pause();
    }
    if (inlineRef.current?.readyState) restorePlayback(inlineRef.current, playbackRef.current);
    setOpen(false);
    onExpandedChange(false);
  }, [onExpandedChange]);

  useEffect(() => {
    if (!active) {
      inlineRef.current?.pause();
      if (open) close();
    }
  }, [active, open, close]);
  useEffect(() => () => onExpandedChange(false), [onExpandedChange]);

  const expand = () => {
    if (inlineRef.current) {
      playbackRef.current = readPlayback(inlineRef.current);
      inlineRef.current.pause();
    }
    // Mount first, then request within the trusted click (before transient activation expires).
    flushSync(() => { setOpen(true); onExpandedChange(true); });
    void lightboxRef.current?.enterFullscreen();
  };

  return (
    <>
      <video ref={inlineRef} className="result-video" src={src} controls controlsList="nofullscreen nodownload" playsInline preload="metadata"
        onDoubleClick={expand} />
      <div className="result-actions">
        {children}
        <button type="button" className="btn btn-ghost" onClick={expand}>全屏播放</button>
      </div>
      <VideoLightbox ref={lightboxRef} open={open} title={title} onClose={close}>
        <video ref={expandedRef} className="lightbox-video" src={src} controls controlsList="nofullscreen nodownload" autoPlay playsInline preload="metadata"
          onLoadedMetadata={(event) => restorePlayback(event.currentTarget, playbackRef.current)} />
      </VideoLightbox>
    </>
  );
}
