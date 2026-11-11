import { interpolate } from "remotion";
import { CLAMP } from "../templates/theme";
import { getIllustrationWindow, type Timeline } from "../timing";

export type VisualAnimation = {
  start: number;
  end: number;
  enter: number;
  exit: number;
  pulse: number;
};

/** 当前段落的图案动画：入场 → 强调脉冲 → 下一段出现时退场 */
export const getVisualAnimation = (
  frame: number,
  timeline: Timeline,
  index: 0 | 1 | 2,
): VisualAnimation => {
  const { start, end } = getIllustrationWindow(index, timeline);
  const enter = interpolate(frame, [start, start + timeline.enter], [0, 1], CLAMP);

  const exitSpan = Math.min(timeline.enter, Math.max(6, Math.round((end - start) * 0.18)));
  const exit =
    index === 2
      ? interpolate(frame, [timeline.outroStart, timeline.total - 1], [0, 1], CLAMP)
      : interpolate(frame, [end - exitSpan, end], [0, 1], CLAMP);

  const pulseStart = start + timeline.enter;
  const span = Math.max(1, end - pulseStart);
  const pulse =
    frame <= pulseStart ? 0 : Math.sin(Math.min(1, (frame - pulseStart) / span) * Math.PI) * 0.8;

  return { start, end, enter, exit, pulse };
};