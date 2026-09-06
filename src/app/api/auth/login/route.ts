import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation";
import { rateLimitAsync } from "@/lib/rate-limit";
import { getClientIp, readJsonWithLimit } from "@/lib/security";
import { generateCsrfToken } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimitAsync(`login:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Too many attempts — try in 15m" }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } });

  let body: unknown;
  try {
    body = await readJsonWithLimit(req, 8 * 1024);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON";
    return NextResponse.json({ error: msg }, { status: msg === "Payload too large" ? 413 : 400 });
  }
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid email or password" }, { status: 400 });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Supabase not configured — add env to enable login. Use Continue without signup for now." }, { status: 503 });
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 401 });
    const csrf = generateCsrfToken(process.env.CSRF_SECRET ?? process.env.AUTH_SECRET);
    const res = NextResponse.json({ ok: true });
    res.cookies.set("__Host-csrf", csrf, { httpOnly: false, secure: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 7 });
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
