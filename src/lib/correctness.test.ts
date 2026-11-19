import assert from "node:assert/strict";
import test from "node:test";
import { createEditorDraft, decodeEditorDraft, encodeEditorDraft } from "./projectDraft";
import { prepareNarratedVideo } from "./narrationValidation";
import { DEFAULT_VIDEO_PROPS, getDurationInFrames, type VideoProps } from "../remotion/params";
import { buildScriptFromLines, narrationContentKey, NARRATION_SCENE_IDS, type NarrationProps } from "../remotion/narration";
import { createTextLayer, createImageLayer } from "../remotion/layers";
import { getActiveIndex, getTimeline } from "../remotion/timing";
import { getVisualAnimation } from "../remotion/illustrations/visualAnimation";
import type { TtsRecord } from "./tts/types";

const props = structuredClone(DEFAULT_VIDEO_PROPS);
const script = buildScriptFromLines(props.title, props.lines);
const scenes = NARRATION_SCENE_IDS.map((id, index) => ({
  id, text: script.split("\n")[index], startFrame: [0, 30, 70, 180][index], endFrame: [25, 65, 175, 230][index],
}));
const record: TtsRecord = {
  id: "a".repeat(20), provider: "local", voiceId: "local:test", voiceName: "测试音色", speed: 1,
  script, fileName: `${"a".repeat(20)}.wav`, durationSeconds: 230 / 30, sampleRate: 24000,
  cues: scenes.map((scene) => ({ text: scene.text, lines: [scene.text], sceneId: scene.id,
    startSeconds: scene.startFrame / 30, endSeconds: scene.endFrame / 30,
    startFrame: scene.startFrame, endFrame: scene.endFrame })),
  chunkCount: 4, createdAt: new Date().toISOString(), contentKey: narrationContentKey(props), scenes,
};
const narrated = (): VideoProps => ({ ...structuredClone(props), durationMode: "voice",
  narration: { ...props.narration, enabled: true, ttsId: record.id, audioSrc: `/api/tts/${record.id}/audio`,
    script, voiceId: record.voiceId, speed: 1, audioDurationSeconds: 1 },
  subtitles: { ...props.subtitles, enabled: true, cues: structuredClone(record.cues) },
});

test("draft preserves incomplete input, layer placement, subtitle edits and resource references", () => {
  const draft = createEditorDraft();
  draft.values.title = "";
  draft.values.line1 = "尚未写完的中文 ✨";
  draft.values.template = "quote";
  draft.values.ratio = "16:9";
  draft.layers = [createTextLayer({ text: "保存的文字", x: 0.321, rotation: 22, endFrame: 240 }),
    createImageLayer({ id: "test", url: "/api/uploads/test.png", name: "图片", width: 800, height: 600 }, { width: 1920, height: 1080 }, { y: 0.4, endFrame: 240 })];
  draft.ttsId = record.id;
  draft.scriptTouched = true;
  draft.script = "自定义讲稿\n一\n二\n三";
  draft.subtitleTexts = ["自定义字幕"];
  draft.subtitleColor = "#FF0000";
  draft.jobId = "12345678-abcd-1234-abcd-123456789012";
  const restored = decodeEditorDraft(encodeEditorDraft(draft));
  assert.equal(restored.values.title, "");
  assert.equal(restored.values.line1, draft.values.line1);
  assert.equal(restored.layers[0].x, 0.321);
  assert.equal(restored.layers[0].rotation, 22);
  assert.equal(restored.layers[1].y, 0.4);
  assert.equal(restored.ttsId, record.id);
  assert.equal(restored.script, draft.script);
  assert.deepEqual(restored.subtitleTexts, ["自定义字幕"]);
  assert.equal(restored.subtitleColor, "#FF0000");
  assert.equal(restored.jobId, draft.jobId);
});

test("corrupt/unknown draft versions are rejected without being treated as empty projects", () => {
  for (const raw of ["{broken", "{}", '{"version":2,"data":{}}', '{"version":1,"data":[]}']) {
    assert.throws(() => decodeEditorDraft(raw));
  }
});

test("server rejects changed script, voice, speed or visual content with an old audio record", () => {
  const mutations = [
    (p: VideoProps) => { p.narration.script += "新的内容"; },
    (p: VideoProps) => { p.narration.voiceId = "local:other"; },
    (p: VideoProps) => { p.narration.speed = 1.2; },
    (p: VideoProps) => { p.lines[1] = "新的第二段"; },
    (p: VideoProps) => { p.title = "新的标题"; },
  ];
  for (const mutate of mutations) {
    const input = narrated(); mutate(input);
    assert.throws(() => prepareNarratedVideo(input, record), /重新生成配音/);
  }
  assert.throws(() => prepareNarratedVideo(narrated(), null), /文件已失效/);
  assert.throws(() => prepareNarratedVideo(narrated(), { ...record, scenes: undefined }), /时间轴/);
});

test("server uses measured duration, scene frames and cue frames while retaining subtitle text edits", () => {
  const input = narrated();
  input.narration.audioSrc = "https://invalid.example/audio.wav";
  input.narration.scenes = [];
  input.subtitles.cues[1].text = "用户修正的字幕";
  input.subtitles.cues[2].startFrame = 99;
  const result = prepareNarratedVideo(input, record);
  assert.equal(result.narration.audioDurationSeconds, record.durationSeconds);
  assert.equal(result.narration.audioSrc, `/api/tts/${record.id}/audio`);
  assert.deepEqual(result.narration.scenes, scenes);
  assert.equal(result.durationInSeconds, 8.5);
  assert.equal(result.subtitles.cues[1].text, "用户修正的字幕");
  assert.equal(result.subtitles.cues[2].startFrame, 70);
});

test("each visual scene starts at its audio boundary and outro waits until speech finishes", () => {
  const result = prepareNarratedVideo(narrated(), record);
  const timeline = getTimeline(getDurationInFrames(result), result.narration);
  assert.deepEqual(timeline.lineStarts, [30, 70, 180]);
  assert.equal(getActiveIndex(69, timeline), 0);
  assert.equal(getActiveIndex(70, timeline), 1);
  assert.equal(getActiveIndex(179, timeline), 1);
  assert.equal(getActiveIndex(180, timeline), 2);
  assert.ok(timeline.outroStart >= 230);
  const silent = getTimeline(450, { enabled: false } as NarrationProps);
  assert.notDeepEqual(silent.lineStarts, timeline.lineStarts);
});

test("narration at the duration cap stays visible through the last spoken frame", () => {
  for (const endFrame of [449, 450]) {
    const input = narrated();
    const capped = structuredClone(record);
    capped.durationSeconds = endFrame / 30;
    capped.scenes![3].endFrame = endFrame;
    capped.cues[3].endFrame = endFrame;
    capped.cues[3].endSeconds = endFrame / 30;
    const prepared = prepareNarratedVideo(input, capped);
    assert.equal(getDurationInFrames(prepared), 450);
    const timeline = getTimeline(450, prepared.narration);
    assert.ok(timeline.outroStart >= endFrame);
    assert.equal(getVisualAnimation(448, timeline, 2).exit, 0);
    assert.ok(Number.isFinite(getVisualAnimation(449, timeline, 2).exit));
  }
});
