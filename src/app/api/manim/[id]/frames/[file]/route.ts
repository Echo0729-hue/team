import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { manimFramePath } from "@/lib/manim";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await context.params;
  const frame = manimFramePath(id, file);
  if (!frame) return NextResponse.json({ message: "动画帧不存在。" }, { status: 404 });
  try {
    const buffer = await fs.readFile(frame);
    return new Response(buffer, { headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable" } });
  } catch { return NextResponse.json({ message: "动画帧丢失，请重新生成。" }, { status: 404 }); }
}
