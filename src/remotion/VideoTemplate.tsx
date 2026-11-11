import React from "react";
import { AbsoluteFill, Audio } from "remotion";
import type { VideoProps } from "./params";
import { TechTemplate } from "./templates/TechTemplate";
import { EditorialTemplate } from "./templates/EditorialTemplate";
import { CardsTemplate } from "./templates/CardsTemplate";
import { SplitTemplate } from "./templates/SplitTemplate";
import { QuoteTemplate } from "./templates/QuoteTemplate";
import { KineticTemplate } from "./templates/KineticTemplate";
import { SubtitleTrack } from "./SubtitleTrack";
import { OverlayLayers } from "./OverlayLayers";

/**
 * 唯一的视频组件：按 template 派发到 6 套画面。
 * 配音（Audio）与字幕（SubtitleTrack）在同一层叠加，预览与导出使用同一份参数，
 * 字幕时间轴来自配音每句真实时长，所以音画与字幕天然同步。
 */
export const TextPromoVideo: React.FC<VideoProps> = (props) => {
  const { template, narration, subtitles } = props;
  const hasNarration = Boolean(narration?.enabled && narration.audioSrc);
  const hasSubtitles = Boolean(subtitles?.enabled && subtitles.cues.length > 0);

  const body = (() => {
    switch (template) {
      case "editorial":
        return <EditorialTemplate {...props} />;
      case "cards":
        return <CardsTemplate {...props} />;
      case "split":
        return <SplitTemplate {...props} />;
      case "quote":
        return <QuoteTemplate {...props} />;
      case "kinetic":
        return <KineticTemplate {...props} />;
      case "tech":
      default:
        return <TechTemplate {...props} />;
    }
  })();

  return (
    <AbsoluteFill style={{ backgroundColor: props.backgroundColor }}>
      {body}
      <OverlayLayers layers={props.layers ?? []} />
      {hasNarration ? <Audio src={narration.audioSrc as string} volume={narration.volume} /> : null}
      {hasSubtitles ? <SubtitleTrack subtitles={subtitles} /> : null}
    </AbsoluteFill>
  );
};