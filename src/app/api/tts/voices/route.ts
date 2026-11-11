import { NextResponse } from "next/server";
import { listTtsVoices } from "@/lib/tts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 实际可用的中文音色（本机语音包 / 云端配置决定） */
export async function GET() {
  try {
    const { config, voices } = await listTtsVoices();
    return NextResponse.json({ config, voices });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "读取音色失败。" },
      { status: 500 },
    );
  }
}