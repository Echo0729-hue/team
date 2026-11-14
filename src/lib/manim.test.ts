import assert from "node:assert/strict";
import test from "node:test";
import { createEffect, sanitizeEffects } from "../remotion/effects";
import { manimFrame, manimFrameName, manimKey, validateManimFormula } from "../remotion/manim";
import { manimFramePath, manimId, normalizeManimInput } from "./manim";
import { createEditorDraft, encodeEditorDraft, decodeEditorDraft } from "./projectDraft";

test("Manim cache changes for rendering data and reuses frames when only compositing changes", () => {
  const e = createEffect("math-formula");
  const key = manimKey(e);
  assert.equal(manimKey({ ...e, id: "another", x: .7, y: .3, opacity: .4, rotation: 30, size: .9, startFrame: 60, endFrame: 100, placement: "back" }), key);
  for (const patch of [{ text: "a=b" }, { variant: "transform" }, { speed: 2 }, { color: "#FF0000" }, { intensity: .2 }]) {
    assert.notEqual(manimKey({ ...e, ...patch }), key);
  }
  assert.match(manimId(normalizeManimInput(e)), /^[a-f0-9]{64}$/);
});
test("Manim formulas accept common mathematics and reject TeX code/file primitives", () => {
  for (const formula of ["E=mc^2", "\\frac{a^2}{b}=c", "\\sqrt{x}+\\sin(\\theta)", "\\begin{aligned}a&=b\\\\c&=d\\end{aligned}"]) assert.equal(validateManimFormula(formula), null, formula);
  for (const formula of ["\\input{secret}", "\\include{x}", "\\write18{cmd}", "\\def\\x{a}", "\\csname input\\endcsname", "x^^5cinput", "x%comment", "\\begin{document}x\\end{document}"]) {
    assert.ok(validateManimFormula(formula), formula);
    assert.throws(() => normalizeManimInput({ ...createEffect("math-formula"), text: formula }));
  }
  assert.throws(() => normalizeManimInput(createEffect("web-card")));
});
test("Manim target formulas and graph parameters survive drafts and stay bounded", () => {
  const draft = createEditorDraft();
  draft.effects = [{ ...createEffect("math-formula"), variant: "transform", targetText: "m=\\frac{E}{c^2}" }, { ...createEffect("math-sine"), amplitude: 2.3, frequency: .45, offset: -1.2 }];
  assert.deepEqual(decodeEditorDraft(encodeEditorDraft(draft)).effects, draft.effects);
  const [e] = sanitizeEffects([{ ...createEffect("math-sine"), amplitude: 999, frequency: -10, offset: Infinity }], 150);
  assert.equal(e.amplitude, 3); assert.equal(e.frequency, .25); assert.equal(e.offset, 0);
  const old = sanitizeEffects([{ preset: "math-formula", text: "E=mc^2" }], 150)[0];
  assert.equal(old.targetText, "m = \\frac{E}{c^2}");
});
test("Manim uses the component local frame, freezes its end and restricts frame files", () => {
  assert.equal(manimFrame(-10, 80), 0); assert.equal(manimFrame(30, 80), 30); assert.equal(manimFrame(450, 80), 79);
  assert.equal(manimFrameName(30), "00030.png");
  assert.equal(manimFramePath("../private", "00000.png"), null);
  assert.equal(manimFramePath("a".repeat(64), "../../file"), null);
  assert.equal(manimFramePath("a".repeat(64), "manifest.json"), null);
});
