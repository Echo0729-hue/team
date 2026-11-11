import { NextResponse } from "next/server";
import { listUploads, saveUpload } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const maxDuration = 60;

/** 上传图片：校验类型 / 大小 / 尺寸，落盘到 output/uploads 并返回元数据 */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ message: "上传内容格式不正确，请重新选择图片。" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ message: "没有收到图片文件。" }, { status: 400 });
  }

  try {
    const result = await saveUpload(file);
    if (!result.ok) {
      return NextResponse.json({ message: result.message }, { status: result.status });
    }
    return NextResponse.json({ upload: result.upload }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "保存图片失败。" },
      { status: 500 },
    );
  }
}

/** 已上传的图片素材列表 */
export async function GET() {
  try {
    return NextResponse.json({ uploads: listUploads() });
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "读取图片素材失败。" },
      { status: 500 },
    );
  }
}