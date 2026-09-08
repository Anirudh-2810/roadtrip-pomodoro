import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signupSchema } from "@/lib/validation";
import { rateLimitAsync } from "@/lib/rate-limit";
import { getClientIp, readJsonWithLimit } from "@/lib/security";
import { generateCsrfToken } from "@/lib/csrf";
import { getAppUrl } from "@/lib/env";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimitAsync(`signup:${ip}`, 5, 60 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited — try later" }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } });

  let body: unknown;
  try {
    body = await readJsonWithLimit(req, 8 * 1024);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON";
    return NextResponse.json({ error: msg }, { status: msg === "Payload too large" ? 413 : 400 });
  }
  const parsed = signupSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const { email, password } = parsed.data;

  // if supabase not configured, return mock success (lets UI flow in guest mode)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ ok: true, mocked: true, message: "Supabase not configured — account mocked. Add env to enable real auth." });
  }

  try {
    const supabase = await createClient();
    const appUrl = getAppUrl();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: `${appUrl}/auth/callback?next=/dashboard` },
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const csrf = generateCsrfToken(process.env.CSRF_SECRET ?? process.env.AUTH_SECRET);
    const res = NextResponse.json({ ok: true });
    res.cookies.set("__Host-csrf", csrf, { httpOnly: false, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
