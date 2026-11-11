/**
 * 统一的时间轴：所有模板按「总帧数」分配标题、三段文案与结尾的时间，
 * 5 秒版本更紧凑、15 秒版本更从容，而不是把固定帧号写死。
 */
export type Timeline = {
  total: number;
  /** 标题入场占用的帧数 */
  intro: number;
  /** 每段文案的时间片长度 */
  slot: number;
  /** 三段文案各自开始的帧 */
  lineStarts: [number, number, number];
  /** 每段入场动画的时长 */
  enter: number;
  /** 结尾收束的帧数 */
  outro: number;
  /** 结尾开始帧 */
  outroStart: number;
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const getTimeline = (durationInFrames: number): Timeline => {
  const total = Math.max(30, durationInFrames);
  const outro = Math.round(clamp(total * 0.07, 8, 30));
  const intro = Math.round(clamp(total * 0.17, 12, 72));
  const content = Math.max(60, total - intro - outro);
  const slot = content / 3;
  const enter = Math.round(clamp(slot * 0.42, 10, 30));

  const lineStarts = [0, 1, 2].map((index) => Math.round(intro + index * slot)) as [
    number,
    number,
    number,
  ];

  return {
    total,
    intro,
    slot,
    lineStarts,
    enter,
    outro,
    outroStart: total - outro,
  };
};

/** 当前处于第几段（0/1/2），用于图案与轮播的切换 */
export const getActiveIndex = (frame: number, timeline: Timeline): 0 | 1 | 2 => {
  if (frame >= timeline.lineStarts[2]) {
    return 2;
  }
  if (frame >= timeline.lineStarts[1]) {
    return 1;
  }
  return 0;
};

/** 某一段图案的展示区间（下一段开始时退场） */
export const getIllustrationWindow = (
  index: number,
  timeline: Timeline,
): { start: number; end: number } => {
  const start = timeline.lineStarts[index];
  const end =
    index < 2 ? timeline.lineStarts[index + 1] : Math.max(start + timeline.enter, timeline.total - 1);
  return { start, end };
};