import { NextResponse } from "next/server";
import { getTtsConfig, synthesizeNarration, ttsAudioUrl } from "@/lib/tts";
import { NARRATION_LIMITS, parseNarrationScenes, type NarrationContent } from "@/remotion/narration";
import { validateVideoInput, DEFAULT_VIDEO_PROPS } from "@/remotion/params";

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
  let content: NarrationContent | undefined;
  if (source.content !== undefined) {
    const candidate = (typeof source.content === "object" && source.content !== null && !Array.isArray(source.content) ? source.content : {}) as Record<string, unknown>;
    const checked = validateVideoInput({ ...DEFAULT_VIDEO_PROPS, ...candidate, narration: { enabled: false } });
    if (typeof candidate.title !== "string" || !Array.isArray(candidate.lines) || candidate.lines.length !== 3 ||
      !checked.ok || !parseNarrationScenes(script)) {
      return NextResponse.json({ message: "请填写标题和三段文案；讲解稿分成四段，依次对应标题与三段正文，每段另起一行。" }, { status: 400 });
    }
    content = { title: checked.value.title, lines: checked.value.lines };
  }

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
    const record = await synthesizeNarration({ script, voiceId, speed, content });
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
        scenes: record.scenes,
        contentKey: record.contentKey,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "配音生成失败。" },
      { status: 500 },
    );
  }
}
