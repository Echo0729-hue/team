import { parseByteRange } from "@/lib/httpRange";
import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";
import { getLibraryItem } from "@/lib/library";
import { getOutputPath } from "@/lib/renderQueue";
import { toDownloadFileName } from "@/lib/videoName";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// node:stream/web 的 ReadableStream 与 DOM 类型定义不同，这里统一转换成 Web 的流
const toWebStream = (stream: ReturnType<typeof fs.createReadStream>): ReadableStream =>
  Readable.toWeb(stream) as unknown as ReadableStream;

/**
 * 播放/下载已渲染好的 MP4。支持 Range 请求，浏览器 <video> 可以拖动进度条。
 * 任务信息在内存中，重启后仍可通过 output/library.json 找回素材。
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = getJob(id);
  const libraryItem = getLibraryItem(id);
  const fileName = job?.fileName ?? libraryItem?.fileName;

  if (!fileName || (job && job.status !== "success")) {
    return NextResponse.json({ message: "视频尚未生成完成。" }, { status: 404 });
  }

  const filePath = getOutputPath(fileName);

  let fileSize: number;
  try {
    const stat = await fs.promises.stat(filePath);
    fileSize = stat.size;
  } catch {
    return NextResponse.json({ message: "视频文件不存在，请重新生成。" }, { status: 404 });
  }

  const url = new URL(request.url);
  const isDownload = url.searchParams.get("download") === "1";
  const rangeHeader = request.headers.get("range");

  // 下载时用素材名称作为文件名；中文按 RFC 5987 编码，并保留 ASCII 兜底
  const downloadName = toDownloadFileName(libraryItem?.name ?? job?.name ?? "");
  const asciiName = downloadName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const disposition = isDownload
    ? `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    : `inline; filename="${fileName}"`;

  const headers = new Headers({
    "Content-Type": "video/mp4",
    "Accept-Ranges": "bytes",
    "Cache-Control": "no-store",
    "Content-Disposition": disposition,
  });

  if (rangeHeader) {
    const range = parseByteRange(rangeHeader, fileSize);
    if (!range) {
      headers.set("Content-Range", `bytes */${fileSize}`);
      return new Response(null, { status: 416, headers });
    }

    const { start, end } = range;
    headers.set("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    headers.set("Content-Length", String(end - start + 1));

    return new Response(toWebStream(fs.createReadStream(filePath, { start, end })), {
      status: 206,
      headers,
    });
  }

  headers.set("Content-Length", String(fileSize));
  return new Response(toWebStream(fs.createReadStream(filePath)), { status: 200, headers });
}