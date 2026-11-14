import { NextResponse } from "next/server";
import { getManimJob } from "@/lib/manim";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = /^[a-f0-9]{64}$/.test(id) ? getManimJob(id) : undefined;
  return job ? NextResponse.json({ job }) : NextResponse.json({ message: "动画缓存不存在，请重新生成。" }, { status: 404 });
}
