import { NextResponse } from "next/server";
import { listLibrary, toPublicLibraryItem } from "@/lib/library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 视频素材列表：读取 output/library.json，刷新页面后仍可取回 */
export async function GET() {
  try {
    const items = listLibrary().map(toPublicLibraryItem);
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "读取素材库失败。" },
      { status: 500 },
    );
  }
}