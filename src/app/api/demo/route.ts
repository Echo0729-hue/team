import { NextResponse } from "next/server";
import { getDemoStatus, startDemoPreparation } from "@/lib/demo";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(getDemoStatus()); }
  catch (error) { return NextResponse.json({ message: (error as Error).message }, { status: 500 }); }
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin && origin !== `http://${request.headers.get("host")}` && origin !== `https://${request.headers.get("host")}`) {
    return NextResponse.json({ message: "请从本站的演示页面准备素材。" }, { status: 403 });
  }
  try {
    const status = startDemoPreparation();
    return NextResponse.json(status, { status: status.status === "ready" ? 200 : 202 });
  } catch (error) { return NextResponse.json({ message: (error as Error).message }, { status: 500 }); }
}
