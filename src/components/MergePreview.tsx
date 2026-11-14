"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { MergeVideo } from "@/remotion/MergeVideo";
import PreviewFullscreenButton from "./PreviewFullscreenButton";
import type { MergeProps, MergeSegment } from "@/remotion/merge";
import { VIDEO_CONFIG, getVideoSize, type RatioId } from "@/remotion/params";

type MergePreviewProps = {
  active?: boolean;
  segments: MergeSegment[];
  ratio: RatioId;
  backgroundColor: string;
  onRequestFullscreen?: () => void;
};

/**
 * 拼接预览：与导出共用 <MergeVideo />、统一比例下的真实分辨率与 30fps，
 * 因此预览里看到的顺序、缩放和留白就是最终成片的效果。
 */
export default function MergePreview({ segments, ratio, backgroundColor, active = true, onRequestFullscreen }: MergePreviewProps) {
  const playerRef = useRef<PlayerRef>(null);
  useEffect(() => { if (!active) playerRef.current?.pause(); }, [active]);
  const composition = getVideoSize({ ratio });
  const durationInFrames = Math.max(
    1,
    segments.reduce((total, segment) => total + segment.durationInFrames, 0),
  );
  const inputProps = useMemo<MergeProps>(
    () => ({ segments, backgroundColor, ratio }),
    [segments, backgroundColor, ratio],
  );

  const holderRef = useRef<HTMLDivElement>(null);
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
      const scale = Math.min(rect.width / composition.width, rect.height / composition.height);
      setSize({
        width: Math.max(1, Math.floor(composition.width * scale)),
        height: Math.max(1, Math.floor(composition.height * scale)),
      });
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [composition.width, composition.height]);

  const key = `${ratio}-${durationInFrames}-${segments.map((segment) => segment.id).join("_")}`;

  return (
    <div ref={holderRef} className="preview-holder">
      {size ? (
        <div className="preview-frame" style={{ width: size.width, height: size.height }} onDoubleClick={onRequestFullscreen}>
          <Player
            ref={playerRef}
            key={key}
            component={MergeVideo}
            inputProps={inputProps}
            durationInFrames={durationInFrames}
            fps={VIDEO_CONFIG.fps}
            compositionWidth={composition.width}
            compositionHeight={composition.height}
            style={{ width: size.width, height: size.height }}
            controls
            initiallyShowControls
            alwaysShowControls
            loop
            noSuspense
            acknowledgeRemotionLicense
            allowFullscreen={false}
            doubleClickToFullscreen={false}
            spaceKeyToPlayOrPause={active}
          />
          {onRequestFullscreen ? <PreviewFullscreenButton onClick={onRequestFullscreen} /> : null}
        </div>
      ) : null}
    </div>
  );
}
