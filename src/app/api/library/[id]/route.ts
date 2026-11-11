import fs from "node:fs";
import { NextResponse } from "next/server";
import { deleteJob } from "@/lib/jobs";
import {
  getLibraryItem,
  removeLibraryItem,
  renameLibraryItem,
  resolveLibraryFilePath,
  toPublicLibraryItem,
} from "@/lib/library";
import { sanitizeVideoName } from "@/lib/videoName";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * 重命名素材。名称会去掉 Windows 非法字符、截断到 60 字，重名自动加序号。
 * 返回更新后的素材记录，前端可直接替换列表项。
 */
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  if (!getLibraryItem(id)) {
    return NextResponse.json({ message: "素材不存在或文件已被删除。" }, { status: 404 });
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  const rawName = typeof payload === "object" && payload !== null ? (payload as { name?: unknown }).name : undefined;
  if (typeof rawName !== "string" || rawName.trim().length === 0) {
    return NextResponse.json({ message: "名称不能为空。" }, { status: 400 });
  }

  // 原名作为兜底，避免全是非法字符时得到空名称
  const item = getLibraryItem(id);
  const desired = sanitizeVideoName(rawName, item?.name ?? "");
  if (desired.length === 0) {
    return NextResponse.json({ message: "名称不能为空或只包含非法字符。" }, { status: 400 });
  }

  const updated = renameLibraryItem(id, desired);
  if (!updated) {
    return NextResponse.json({ message: "重命名失败，素材记录已不存在。" }, { status: 404 });
  }

  return NextResponse.json({ item: toPublicLibraryItem(updated) });
}

/**
 * 删除素材：先删除 output/ 内的视频文件，成功后再移除素材记录与内存任务。
 * 只允许删除 output/ 目录内的文件；任何失败都会返回错误，不会悄悄隐藏。
 */
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const item = getLibraryItem(id);
  if (!item) {
    return NextResponse.json({ message: "素材不存在或文件已被删除。" }, { status: 404 });
  }

  let filePath: string;
  try {
    filePath = resolveLibraryFilePath(item.fileName);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "非法的素材路径。" },
      { status: 400 },
    );
  }

  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { message: `删除视频文件失败：${reason}。文件仍保留在 output/ 中，请关闭占用后重试。` },
      { status: 500 },
    );
  }

  removeLibraryItem(id);
  // 清掉内存里的任务，避免之后还能通过 /api/videos/[id] 访问
  deleteJob(id);

  return NextResponse.json({ id, deleted: true });
}