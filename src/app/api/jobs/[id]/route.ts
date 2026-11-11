import { NextResponse } from "next/server";
import { getJob, toPublicJob } from "@/lib/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 查询单个渲染任务状态 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const job = getJob(id);

  if (!job) {
    return NextResponse.json({ message: "任务不存在。" }, { status: 404 });
  }

  return NextResponse.json({ job: toPublicJob(job) }, { headers: { "Cache-Control": "no-store" } });
}