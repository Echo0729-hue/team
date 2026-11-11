import { NextResponse } from "next/server";
import { getDurationInFrames, validateVideoInput } from "@/remotion/params";
import { createJob, toPublicJob } from "@/lib/jobs";
import { enqueueRender } from "@/lib/renderQueue";
import { sanitizeVideoName } from "@/lib/videoName";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 创建渲染任务：校验通过后进入串行队列 */
export async function POST(request: Request) {
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  const result = validateVideoInput(payload);

  if (!result.ok) {
    return NextResponse.json(
      { message: "输入校验未通过，请修正表单后重试。", errors: result.errors },
      { status: 400 },
    );
  }

  // 名称可选：去掉非法字符、截断到 60 字；为空时回退到标题
  const rawName = typeof payload === "object" && payload !== null ? (payload as { name?: unknown }).name : undefined;
  const name = sanitizeVideoName(rawName, result.value.title);

  const job = createJob(result.value, getDurationInFrames(result.value), { name });
  enqueueRender(job);

  return NextResponse.json({ job: toPublicJob(job) }, { status: 202 });
}