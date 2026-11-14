import { NextResponse } from "next/server";
import { ManimInputError, requestManim } from "@/lib/manim";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const entry = requestManim(body.effect, body.retry === true);
    return NextResponse.json({ job: entry.job }, { status: entry.job.status === "ready" ? 200 : 202 });
  } catch (error) {
    return NextResponse.json({ message: error instanceof ManimInputError ? error.message : "请求格式无效，请重试。" }, { status: 400 });
  }
}
