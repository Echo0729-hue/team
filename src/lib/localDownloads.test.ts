import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { isLocalSaveRequest, saveVideoCopy } from "./localDownloads";

test("local video saves reject foreign, missing and nonlocal origins", () => {
  const request = (url: string, origin?: string, site?: string) => new Request(url, { headers: {
    ...(origin ? { origin } : {}), ...(site ? { "sec-fetch-site": site } : {}),
  } });
  assert.equal(isLocalSaveRequest(request("http://127.0.0.1:3000/api/videos/x/save", "http://127.0.0.1:3000", "same-origin")), true);
  assert.equal(isLocalSaveRequest(request("http://localhost:3000/api/videos/x/save", "http://localhost:3000")), true);
  assert.equal(isLocalSaveRequest(request("http://127.0.0.1:3000/api/videos/x/save")), false);
  assert.equal(isLocalSaveRequest(request("http://127.0.0.1:3000/api/videos/x/save", "https://example.com")), false);
  assert.equal(isLocalSaveRequest(request("https://example.com/api/videos/x/save", "https://example.com")), false);
  assert.equal(isLocalSaveRequest(request("http://localhost:3000/api/videos/x/save", "http://localhost:3000", "cross-site")), false);
  assert.equal(isLocalSaveRequest(new Request("http://localhost:3000/api/videos/x/save", {
    headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000", "sec-fetch-site": "same-origin" },
  })), true);
});

test("simultaneous video downloads preserve content and never overwrite an earlier file", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "video-save-regression-"));
  try {
    const source = path.join(directory, "source.mp4");
    const bytes = Buffer.from("MP4 test content, including Chinese 文案", "utf8");
    await fs.writeFile(source, bytes);
    const destination = path.join(directory, "downloads");
    const copies = await Promise.all(Array.from({ length: 3 }, () => saveVideoCopy(source, "下载验收😀", destination)));
    assert.equal(new Set(copies.map((file) => file.path)).size, 3);
    for (const copy of copies) assert.deepEqual(await fs.readFile(copy.path), bytes);
    const reserved = await saveVideoCopy(source, "CON", destination);
    assert.equal(reserved.fileName, "_CON.mp4");
    const traversal = await saveVideoCopy(source, "../name", destination);
    assert.equal(path.dirname(traversal.path), destination);
    const empty = path.join(directory, "empty.mp4");
    await fs.writeFile(empty, "");
    await assert.rejects(saveVideoCopy(empty, "empty", destination), /为空/);
  } finally { await fs.rm(directory, { recursive: true, force: true }); }
});
