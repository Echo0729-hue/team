import fs from "node:fs";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { listUploads, mimeForFile, resolveUploadPath } from "@/lib/uploads";
import { isUploadInUse } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const toWebStream = (stream: ReturnType<typeof fs.createReadStream>): ReadableStream =>
  Readable.toWeb(stream) as unknown as ReadableStream;

/** 读取已上传的图片：预览与渲染都从这里取同一份文件 */
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  // Next already decodes route parameters. Decoding twice throws on a literal '%' name.
  const decoded = file;

  if (!/^[A-Za-z0-9-]+\.(png|jpg|jpeg|webp)$/i.test(decoded)) {
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
    if (!stat.isFile()) throw new Error("Not a file");
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

/** Free an upload slot without removing files used by an active render. */
export async function DELETE(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  const record = listUploads().find((item) => item.fileName === file);
  if (!record) return NextResponse.json({ message: "图片不存在或已删除。" }, { status: 404 });
  if (isUploadInUse(record.url)) return NextResponse.json({ message: "图片正用于导出任务，请等待导出结束后再删除。" }, { status: 409 });
  try {
    fs.unlinkSync(resolveUploadPath(record.fileName));
    fs.rmSync(resolveUploadPath(`${record.id}.json`), { force: true });
    return NextResponse.json({ deleted: true, id: record.id });
  } catch {
    return NextResponse.json({ message: "删除图片失败，请关闭占用该文件的程序后重试。" }, { status: 500 });
  }
}
