import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { mimeForFile, resolveUploadPath } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toWebStream = (stream: ReturnType<typeof fs.createReadStream>): ReadableStream =>
  Readable.toWeb(stream) as unknown as ReadableStream;

/** 读取已上传的图片：预览与渲染都从这里取同一份文件 */
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  const decoded = decodeURIComponent(file);

  if (decoded.includes("..") || decoded.includes("/") || decoded.includes("\\")) {
    return NextResponse.json({ message: "非法的文件名。" }, { status: 400 });
  }

  let filePath: string;
  try {
    filePath = resolveUploadPath(decoded);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "非法的图片路径。" },
      { status: 400 },
    );
  }

  let stat: fs.Stats;
  try {
    stat = await fs.promises.stat(filePath);
  } catch {
    return NextResponse.json({ message: "图片不存在，请重新上传。" }, { status: 404 });
  }

  return new Response(toWebStream(fs.createReadStream(filePath)), {
    status: 200,
    headers: {
      "Content-Type": mimeForFile(decoded),
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}