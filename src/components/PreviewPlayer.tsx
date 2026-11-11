"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { TextPromoVideo } from "@/remotion/VideoTemplate";
import { VIDEO_CONFIG, getDurationInFrames, getVideoSize, type VideoProps } from "@/remotion/params";

type PreviewPlayerProps = {
  inputProps: VideoProps;
  /** 编辑模式：不自动播放、点击不播放，方便在画面上拖动图层 */
  editing?: boolean;
  /** 叠加在画面之上的编辑层 */
  overlay?: ReactNode;
  onPlayingChange?: (playing: boolean) => void;
};

/**
 * 网页预览：与导出共用 <TextPromoVideo />、参数定义和真实分辨率。
 * 画框尺寸按当前比例在容器内等比适配，Player 用同一组像素尺寸渲染，
 * 因此切换比例时画面不会被拉伸或裁切；编辑模式下会把画框尺寸交给叠加层做坐标换算。
 */
export default function PreviewPlayer({
  inputProps,
  editing = false,
  overlay,
  onPlayingChange,
}: PreviewPlayerProps) {
  const playerInputProps = useMemo(() => inputProps, [inputProps]);
  const { width: compositionWidth, height: compositionHeight } = getVideoSize(inputProps);
  const durationInFrames = getDurationInFrames(inputProps);
  const holderRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerRef>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    const element = holderRef.current;
    if (!element) {
      return;
    }

    const measure = () => {
      const rect = element.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return;
      }
      const scale = Math.min(rect.width / compositionWidth, rect.height / compositionHeight);
      setSize({
        width: Math.max(1, Math.floor(compositionWidth * scale)),
        height: Math.max(1, Math.floor(compositionHeight * scale)),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [compositionWidth, compositionHeight]);

  useEffect(() => {
    if (!onPlayingChange) {
      return;
    }
    const timer = window.setInterval(() => {
      onPlayingChange(Boolean(playerRef.current?.isPlaying()));
    }, 200);
    return () => window.clearInterval(timer);
  }, [onPlayingChange]);

  return (
    <div ref={holderRef} className="preview-holder">
      {size ? (
        <div className="preview-frame" style={{ width: size.width, height: size.height }}>
          <Player
            ref={playerRef}
            key={`${inputProps.template}-${inputProps.ratio}-${durationInFrames}-${size.width}x${size.height}-${inputProps.narration?.ttsId ?? "silent"}`}
            component={TextPromoVideo}
            inputProps={playerInputProps}
            durationInFrames={durationInFrames}
            fps={VIDEO_CONFIG.fps}
            compositionWidth={compositionWidth}
            compositionHeight={compositionHeight}
            style={{ width: size.width, height: size.height }}
            controls
            initiallyShowControls
            alwaysShowControls
            loop={!editing}
            autoPlay={!editing}
            initialFrame={editing ? 0 : 24}
            clickToPlay={!editing}
            doubleClickToFullscreen={!editing}
            spaceKeyToPlayOrPause
            noSuspense
            acknowledgeRemotionLicense
          />
          {overlay ? <div className="preview-overlay">{overlay}</div> : null}
        </div>
      ) : null}
    </div>
  );
}