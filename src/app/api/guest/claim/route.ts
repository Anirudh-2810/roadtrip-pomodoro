import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { guestClaimSchema } from "@/lib/validation";
import { rateLimitAsync } from "@/lib/rate-limit";
import { getClientIp, readJsonWithLimit } from "@/lib/security";
import { checkCsrf } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Log in to claim guest sessions" }, { status: 401 });

  const ip = getClientIp(req);
  const rl = await rateLimitAsync(`guest-claim:${user.id}:${ip}`, 1, 5 * 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited — try in 5m" }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } });

  const cookieCsrf = req.cookies.get("__Host-csrf")?.value ?? null;
  if (cookieCsrf && !checkCsrf(req, cookieCsrf)) {
    return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await readJsonWithLimit(req, 8 * 1024);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Invalid JSON";
    return NextResponse.json({ error: msg }, { status: msg === "Payload too large" ? 413 : 400 });
  }
  const parsed = guestClaimSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid claim" }, { status: 400 });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: true, mocked: true, claimed: parsed.data.sessions.length });
  }

  try {
    const supabase = await createClient();
    const rows = parsed.data.sessions.map((s) => ({
      user_id: user.id,
      started_at: s.started_at,
      finished_at: s.finished_at,
      duration_sec: s.duration_sec,
      preset: s.preset,
      intent: s.intent ?? null,
      completed: s.completed,
      route: s.route ?? s.preset,
    }));
    // insert in chunks of 100
    for (let i = 0; i < rows.length; i += 100) {
      const chunk = rows.slice(i, i + 100);
      const { error } = await supabase.from("sessions").insert(chunk);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, claimed: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
