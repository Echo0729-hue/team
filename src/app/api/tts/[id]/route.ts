import { NextResponse } from "next/server";
import { getTtsRecord, ttsAudioUrl } from "@/lib/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Restore a draft against the server's current audio and metadata. */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  if (!/^[a-f\d]{20}$/.test(id)) return NextResponse.json({ message: "配音记录不存在。" }, { status: 404 });
  const record = getTtsRecord(id);
  if (!record) return NextResponse.json({ message: "配音文件已失效，草稿已保留，请重新生成配音。" }, { status: 404 });
  return NextResponse.json({ tts: {
    id: record.id, audioUrl: ttsAudioUrl(record.id), srtUrl: `/api/tts/${record.id}/srt`,
    durationSeconds: record.durationSeconds, voiceId: record.voiceId, voiceName: record.voiceName,
    provider: record.provider, speed: record.speed, script: record.script, cues: record.cues,
    chunkCount: record.chunkCount, scenes: record.scenes, contentKey: record.contentKey,
  } }, { headers: { "Cache-Control": "no-store" } });
}
