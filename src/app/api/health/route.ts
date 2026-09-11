import { NextResponse } from "next/server";
import { healthEnv } from "@/lib/env";

export async function GET() {
  const h = healthEnv();
  return NextResponse.json({
    ok: true,
    app: "roadtrip-pomodoro",
    maker: "Anirudh-2810",
    repo: "https://github.com/Anirudh-2810/roadtrip-pomodoro",
    supabase: h.supabase ? "configured" : "missing env",
    email: h.resend ? "configured" : "missing RESEND_API_KEY",
    redis: h.redis ? "configured" : "in-memory fallback",
    time: new Date().toISOString(),
  });
}
