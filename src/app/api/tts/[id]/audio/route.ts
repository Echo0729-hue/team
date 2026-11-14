import { parseByteRange } from "@/lib/httpRange";
import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getTtsAudioPath, getTtsRecord } from "@/lib/tts";
import { toDownloadFileName } from "@/lib/videoName";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toWebStream = (stream: ReturnType<typeof fs.createReadStream>): ReadableStream =>
  Readable.toWeb(stream) as unknown as ReadableStream;

/** 配音音频：试听、网页预览与导出都用这一份文件 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const filePath = getTtsAudioPath(id);
  const record = getTtsRecord(id);

  if (!filePath) {
    return NextResponse.json({ message: "配音文件不存在，请重新生成。" }, { status: 404 });
  }

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
    if (!stat.isFile()) throw new Error("Not a file");
  } catch {
    return NextResponse.json({ message: "配音文件不存在，请重新生成。" }, { status: 404 });
  }
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
    headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(toDownloadFileName(name, ".wav"))}`);
  }

  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, stat.size);
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