import { NextResponse } from "next/server";

export async function GET() {
  const supabaseOk = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const resendOk = Boolean(process.env.RESEND_API_KEY);
  return NextResponse.json({
    ok: true,
    supabase: supabaseOk ? "configured" : "missing env",
    email: resendOk ? "configured" : "missing RESEND_API_KEY",
    time: new Date().toISOString(),
  });
}
