import { NextResponse } from "next/server";
import { getTtsRecord } from "@/lib/tts";
import { cuesToSrt } from "@/remotion/subtitles";
import { VIDEO_CONFIG } from "@/remotion/params";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 下载 SRT：与视频内渲染的字幕使用同一份时间轴 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const record = getTtsRecord(id);
  if (!record) {
    return NextResponse.json({ message: "配音记录不存在，请重新生成。" }, { status: 404 });
  }

  const cues = record.cues.map((cue) => ({
    text: cue.text,
    lines: cue.lines,
    startFrame: cue.startFrame,
    endFrame: cue.endFrame,
  }));
  const srt = cuesToSrt(cues, VIDEO_CONFIG.fps);
  const fileName = `${record.script.slice(0, 12) || "字幕"}.srt`;

  return new Response(srt, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      "Cache-Control": "no-store",
    },
  });
}