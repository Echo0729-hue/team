import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getTtsAudioPath, getTtsRecord } from "@/lib/tts";
import { toDownloadFileName } from "@/lib/videoName";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toWebStream = (stream: ReturnType<typeof fs.createReadStream>): ReadableStream =>
  Readable.toWeb(stream) as unknown as ReadableStream;

const parseRange = (rangeHeader: string, fileSize: number): { start: number; end: number } | null => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (!match) {
    return null;
  }
  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") {
    return null;
  }

  let start: number;
  let end: number;
  if (rawStart === "") {
    start = Math.max(0, fileSize - Number.parseInt(rawEnd, 10));
    end = fileSize - 1;
  } else {
    start = Number.parseInt(rawStart, 10);
    end = rawEnd === "" ? fileSize - 1 : Math.min(Number.parseInt(rawEnd, 10), fileSize - 1);
  }

  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileSize) {
    return null;
  }
  return { start, end };
};

/** 配音音频：试听、网页预览与导出都用这一份文件 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const filePath = getTtsAudioPath(id);
  const record = getTtsRecord(id);

  if (!filePath) {
    return NextResponse.json({ message: "配音文件不存在，请重新生成。" }, { status: 404 });
  }

  const stat = await fs.promises.stat(filePath);
  const url = new URL(request.url);
  const isDownload = url.searchParams.get("download") === "1";
  const rangeHeader = request.headers.get("range");

  const headers = new Headers({
    "Content-Type": "audio/wav",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
  });

  if (isDownload) {
    const name = record ? `${record.voiceName}-配音` : "配音";
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(toDownloadFileName(name))}`);
  }

  if (rangeHeader) {
    const range = parseRange(rangeHeader, stat.size);
    if (!range) {
      headers.set("Content-Range", `bytes */${stat.size}`);
      return new Response(null, { status: 416, headers });
    }
    headers.set("Content-Range", `bytes ${range.start}-${range.end}/${stat.size}`);
    headers.set("Content-Length", String(range.end - range.start + 1));
    return new Response(toWebStream(fs.createReadStream(filePath, { start: range.start, end: range.end })), {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", String(stat.size));
  return new Response(toWebStream(fs.createReadStream(filePath)), { status: 200, headers });
}