import { NextResponse } from "next/server";
import { getJob } from "@/lib/jobs";
import { getLibraryItem, resolveLibraryFilePath } from "@/lib/library";
import { isLocalSaveRequest, saveVideoCopy } from "@/lib/localDownloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Local desktop fallback for embedded browsers without a file-save handler. */
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isLocalSaveRequest(request)) {
    return NextResponse.json({ message: "本机保存仅支持从同一台电脑的本地网页发起。" }, { status: 403 });
  }
  const { id } = await context.params;
  if (!/^[a-f\d-]{36}$/i.test(id)) return NextResponse.json({ message: "视频编号无效。" }, { status: 400 });
  try {
    const job = getJob(id);
    const item = getLibraryItem(id);
    const fileName = item?.fileName ?? (job?.status === "success" ? job.fileName : null);
    if (!fileName) return NextResponse.json({ message: "视频尚未生成或已被删除。" }, { status: 404 });
    const saved = await saveVideoCopy(resolveLibraryFilePath(fileName), item?.name ?? job?.name ?? "视频");
    return NextResponse.json({ saved }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    const message = code === "ENOENT" ? "视频文件不存在，请重新导出。"
      : code === "EACCES" || code === "EPERM" ? "无法写入下载文件夹，请检查文件夹权限。"
      : code === "ENOSPC" ? "下载文件夹所在磁盘空间不足。" : "视频保存失败，请重试。";
    return NextResponse.json({ message }, { status: code === "ENOENT" ? 404 : 500 });
  }
}
