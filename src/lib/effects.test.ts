import assert from "node:assert/strict";
import test from "node:test";
import { createEffect, EFFECT_PRESETS, effectTiming, MAX_EFFECTS, sanitizeEffects } from "../remotion/effects";
import { DEFAULT_VIDEO_PROPS, validateVideoInput, VIDEO_RATIOS, VIDEO_TEMPLATES } from "../remotion/params";
import { createEditorDraft, decodeEditorDraft, encodeEditorDraft } from "./projectDraft";

test("effect draft roundtrip preserves order, hidden state, custom data and follow-end behavior", () => {
  const draft = createEditorDraft();
  draft.tab = "effects";
  draft.effects = EFFECT_PRESETS.map((preset, index) => ({ ...createEffect(preset.id), x: index / 10, hidden: index === 2 }));
  draft.effects[1].values = [0, 37.5, 100];
  draft.effects[6].text = "\\frac{a^2}{b} = c";
  draft.effects[0].startFrame = 31;
  draft.effects[0].endFrame = 110;
  draft.selectedEffectId = draft.effects[6].id;
  const restored = decodeEditorDraft(encodeEditorDraft(draft));
  assert.deepEqual(restored.effects, draft.effects);
  assert.equal(restored.selectedEffectId, draft.selectedEffectId);
  assert.equal(restored.tab, "effects");
  assert.equal(restored.effects[1].endFrame, null);
});

test("old drafts and render requests retain their previous behavior without effects", () => {
  const draft = decodeEditorDraft(JSON.stringify({ version: 1, data: { values: { title: "旧草稿" }, layers: [] } }));
  assert.deepEqual(draft.effects, []);
  assert.equal(draft.selectedEffectId, null);
  const { effects: _effects, ...oldRequest } = DEFAULT_VIDEO_PROPS;
  const result = validateVideoInput(oldRequest);
  assert.ok(result.ok);
  assert.deepEqual(result.value.effects, []);
});

test("all effect components survive the actual export schema across every template and ratio", () => {
  const effects = EFFECT_PRESETS.map((p) => createEffect(p.id));
  for (const template of VIDEO_TEMPLATES) for (const ratio of VIDEO_RATIOS) {
    const result = validateVideoInput({ ...DEFAULT_VIDEO_PROPS, template: template.id, ratio: ratio.id, effects });
    assert.ok(result.ok);
    assert.deepEqual(result.value.effects, effects);
  }
});

test("untrusted effect requests cannot add unknown components, duplicate ids, unsafe variants or unbounded data", () => {
  const effect = createEffect("web-bars");
  const cleaned = sanitizeEffects([null, [], { preset: "injected-script" }, {
    ...effect, size: Infinity, speed: NaN, intensity: -3, opacity: 12, color: "url(https://example.com)",
    secondaryColor: "red", startFrame: -30, endFrame: -20, values: [NaN, Infinity, -5, 200, 50, 60, 70], variant: "<script>",
  }, effect], 150);
  assert.equal(cleaned.length, 1);
  assert.equal(cleaned[0].startFrame, 0);
  assert.equal(cleaned[0].endFrame, 1);
  assert.equal(cleaned[0].size, 0.65);
  assert.equal(cleaned[0].speed, 1);
  assert.equal(cleaned[0].intensity, 0);
  assert.equal(cleaned[0].opacity, 1);
  assert.equal(cleaned[0].color, "#38BDF8");
  assert.equal(cleaned[0].variant, "rounded");
  assert.deepEqual(cleaned[0].values, [0, 0, 0, 100, 50, 60]);
  assert.equal(sanitizeEffects(Array.from({ length: 30 }, () => createEffect("three-cube")), 150).length, MAX_EFFECTS);
});

test("effect windows use exclusive ends, exact frame offsets, visibility and adaptive video endings", () => {
  const effect = { ...createEffect("math-sine"), startFrame: 30, endFrame: 90 };
  assert.equal(effectTiming(effect, 29, 150, 30).active, false);
  assert.equal(effectTiming(effect, 30, 150, 30).seconds, 0);
  assert.equal(effectTiming(effect, 60, 150, 30).seconds, 1);
  assert.equal(effectTiming(effect, 89, 150, 30).active, true);
  assert.equal(effectTiming(effect, 90, 150, 30).active, false);
  assert.equal(effectTiming({ ...effect, hidden: true }, 60, 150, 30).active, false);
  const follow = { ...effect, endFrame: null };
  assert.equal(effectTiming(follow, 200, 450, 30).active, true);
  assert.equal(effectTiming(follow, 200, 150, 30).active, false);
  const a = effectTiming(effect, 60, 150, 30);
  assert.deepEqual(effectTiming(effect, 60, 150, 30), a);
});
