import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeLayers, createImageLayer, createTextLayer, imageHeightForWidth } from "../remotion/layers";
import { sanitizeCues, wrapSubtitleText } from "../remotion/subtitles";
import { splitScriptIntoCues, TTS_CUE_MAX_CHARS } from "./tts/split";
import { parseWav, encodeWav } from "./tts/wav";
import { parseByteRange } from "./httpRange";
import { resolveInside } from "./filePaths";
import path from "node:path";
import { readImageSize, saveUpload } from "./uploads";
import { buildUniqueVideoName, toDownloadFileName } from "./videoName";
import { createJob, deleteJob, isVideoInUse, updateJob } from "./jobs";
import { DEFAULT_VIDEO_PROPS, VIDEO_RATIOS } from "../remotion/params";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";

test("image layers reject paths with extra directory or traversal components", () => {
  const image = createImageLayer({ id: "test", name: "test", url: "/api/uploads/test.png", width: 1, height: 1 }, { width: 1080, height: 1920 });
  for (const src of ["/api/uploads/../../test.png", "/api/uploads/nested/test.png", "/api/uploads/%2e%2e/test.png"]) {
    assert.equal(sanitizeLayers([{ ...image, src }], 150).length, 0);
  }
  assert.equal(sanitizeLayers([image], 150).length, 1);
});

test("layer sanitization never produces an empty time window or duplicate id", () => {
  const layer = createTextLayer({ id: "same", startFrame: 500, endFrame: 500 });
  const clean = sanitizeLayers([layer, layer], 150);
  assert.equal(clean.length, 1);
  assert.ok(clean[0].startFrame < clean[0].endFrame);
  assert.ok(clean[0].endFrame <= 150);
});

test("nested subtitle intervals are dropped when there is no remaining frame", () => {
  const clean = sanitizeCues([
    { text: "first", startFrame: 0, endFrame: 150 },
    { text: "nested", startFrame: 10, endFrame: 20 },
    { text: "rounds to zero", startFrame: 149.6, endFrame: 150 },
  ], 30, 150);
  assert.equal(clean.length, 1);
  assert.ok(clean.every((cue) => cue.startFrame < cue.endFrame && cue.endFrame <= 150));
});

test("subtitle wrapping bounds both lines even with punctuation near the end", () => {
  for (const text of ["很".repeat(70) + "，结尾", "很".repeat(35) + "，结尾", "😀".repeat(50)]) {
    const lines = wrapSubtitleText(text);
    assert.ok(lines.length <= 2);
    assert.ok(lines.every((line) => Array.from(line).length <= 18));
  }
});

test("long unpunctuated narration is split without losing characters", () => {
  const text = "一".repeat(100);
  const pieces = splitScriptIntoCues(text);
  assert.ok(pieces.every((piece) => Array.from(piece).length <= TTS_CUE_MAX_CHARS));
  assert.equal(pieces.join(""), text);
});

test("WAV parser rejects compressed, missing-format and truncated audio", () => {
  const wav = encodeWav({ sampleRate: 24000, channels: 1, bitsPerSample: 16, data: Buffer.alloc(480) });
  assert.equal(parseWav(wav).data.length, 480);
  const compressed = Buffer.from(wav); compressed.writeUInt16LE(3, 20);
  const missingFormat = Buffer.concat([wav.subarray(0, 12), wav.subarray(36)]);
  for (const bad of [compressed, missingFormat, wav.subarray(0, wav.length - 1)]) assert.throws(() => parseWav(bad));
});

test("media ranges support suffixes and reject unsafe numbers and empty intervals", () => {
  assert.deepEqual(parseByteRange("bytes=-10", 100), { start: 90, end: 99 });
  assert.deepEqual(parseByteRange("bytes=5-", 100), { start: 5, end: 99 });
  assert.deepEqual(parseByteRange("bytes=10-1000", 100), { start: 10, end: 99 });
  for (const range of ["bytes=-0", "bytes=-", "bytes=100-", "bytes=20-10", "bytes=0-1,3-4", "bytes=1-9999999999999999999999"]) {
    assert.equal(parseByteRange(range, 100), null);
  }
  assert.equal(parseByteRange("bytes=0-", 0), null);
});

test("file resolution rejects root, traversal and similarly prefixed siblings", () => {
  const root = path.resolve("output");
  assert.equal(resolveInside(root, "clip.mp4"), path.join(root, "clip.mp4"));
  for (const name of [".", "..", "../output-sibling/secret", path.resolve("outside")]) {
    assert.throws(() => resolveInside(root, name));
  }
});

test("uploads reject truncated headers and oversized dimensions before saving", async () => {
  const header = Buffer.alloc(24);
  header.writeUInt32BE(0x89504e47, 0); header.writeUInt32BE(1, 16); header.writeUInt32BE(1, 20);
  assert.equal(readImageSize(header, "image/png"), null);
  assert.equal((await saveUpload(new File([header], "bad.png", { type: "image/png" }))).ok, false);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCKsAAAAASUVORK5CYII=", "base64");
  assert.deepEqual(readImageSize(png, "image/png"), { width: 1, height: 1 });
  png.writeUInt32BE(100000, 16);
  assert.equal((await saveUpload(new File([png], "huge.png", { type: "image/png" }))).ok, false);
});

test("downloads use the media extension and duplicate emoji names remain valid Unicode", () => {
  assert.equal(toDownloadFileName("配音", ".wav"), "配音.wav");
  const name = "😀".repeat(60);
  const unique = buildUniqueVideoName(name, [name]);
  assert.ok(unique.isWellFormed());
  assert.ok(Array.from(unique).length <= 60);
  assert.ok(unique.endsWith(" (2)"));
});

test("active merges keep their source videos protected until they finish", () => {
  const job = createJob(structuredClone(DEFAULT_VIDEO_PROPS), 300, {
    kind: "merge", merge: { segmentIds: ["a", "b"], ratio: "9:16", backgroundColor: "#000000" },
  });
  try {
    assert.equal(isVideoInUse("a"), true);
    updateJob(job.id, { status: "rendering" });
    assert.equal(isVideoInUse("b"), true);
    updateJob(job.id, { status: "success" });
    assert.equal(isVideoInUse("a"), false);
  } finally { deleteJob(job.id); }
});

test("corrupt library records are reported and never overwritten by a new export", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codevideo-library-test-"));
  fs.mkdirSync(path.join(directory, "output"));
  try {
    execFileSync(process.execPath, [path.resolve("node_modules/tsx/dist/cli.mjs"), "--tsconfig", path.resolve("tsconfig.json"), "--eval", `
      const assert = require('node:assert/strict');
      const fs = require('node:fs');
      const { listLibrary, addLibraryItem } = require(process.env.TEST_LIBRARY_MODULE);
      for (const raw of ['{broken', '{"items":[null]}']) {
        fs.writeFileSync('output/library.json', raw);
        assert.throws(() => listLibrary());
        assert.throws(() => addLibraryItem({ id: 'new' }));
        assert.equal(fs.readFileSync('output/library.json', 'utf8'), raw);
      }
    `], { cwd: directory, env: { ...process.env, TEST_LIBRARY_MODULE: path.resolve("src/lib/library.ts") }, windowsHide: true });
  } finally {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith("codevideo-library-test-"));
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("image inspector dimensions preserve aspect on all five canvas ratios", () => {
  for (const canvas of VIDEO_RATIOS) {
    const height = imageHeightForWidth(0.6, 2, canvas);
    assert.ok(Math.abs(0.6 * canvas.width / (height * canvas.height) - 2) < 0.001);
  }
});
