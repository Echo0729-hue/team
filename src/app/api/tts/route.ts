import { NextResponse } from "next/server";
import { getTtsConfig, synthesizeNarration, ttsAudioUrl } from "@/lib/tts";
import { NARRATION_LIMITS } from "@/remotion/narration";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** 生成配音：逐句合成，返回真实时长与字幕时间轴（同一份音频供试听/预览/导出） */
export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ message: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  const source = (typeof payload === "object" && payload !== null ? payload : {}) as Record<string, unknown>;
  const script = typeof source.script === "string" ? source.script.trim() : "";
  const voiceId = typeof source.voiceId === "string" ? source.voiceId : "";
  const speed = typeof source.speed === "number" && Number.isFinite(source.speed) ? source.speed : 1;

  if (script.length === 0) {
    return NextResponse.json({ message: "请先填写讲解稿。" }, { status: 400 });
  }
  if (Array.from(script).length > NARRATION_LIMITS.scriptMaxLength) {
    return NextResponse.json(
      { message: `讲解稿最多 ${NARRATION_LIMITS.scriptMaxLength} 字，当前 ${Array.from(script).length} 字。` },
      { status: 400 },
    );
  }

  const config = await getTtsConfig();
  if (!config.provider) {
    return NextResponse.json(
      { message: config.message, code: "TTS_NOT_CONFIGURED" },
      { status: 503 },
    );
  }

  try {
    const record = await synthesizeNarration({ script, voiceId, speed });
    return NextResponse.json({
      tts: {
        id: record.id,
        audioUrl: ttsAudioUrl(record.id),
        srtUrl: `/api/tts/${record.id}/srt`,
        durationSeconds: record.durationSeconds,
        voiceId: record.voiceId,
        voiceName: record.voiceName,
        provider: record.provider,
        speed: record.speed,
        script: record.script,
        cues: record.cues,
        chunkCount: record.chunkCount,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "配音生成失败。" },
      { status: 500 },
    );
  }
}