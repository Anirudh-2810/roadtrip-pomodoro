import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { rateLimitAsync } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security";

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ip = getClientIp(req);
  const rl = await rateLimitAsync(`email-prefs:${user.id}:${ip}`, 10, 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } });
  // CSRF via cookie: form should include _csrf field matching __Host-csrf
  const cookieCsrf = req.cookies.get("__Host-csrf")?.value ?? null;
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });
  const formCsrf = String(form.get("_csrf") ?? "");
  if (cookieCsrf && formCsrf !== cookieCsrf) return NextResponse.json({ error: "Invalid CSRF token" }, { status: 403 });
  const daily_enabled = form.get("daily_enabled") === "on";
  const weekly_enabled = form.get("weekly_enabled") === "on";
  const daily_time = String(form.get("daily_time") ?? "22:00");
  const weekly_dow = Number(form.get("weekly_dow") ?? 0);

  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { error } = await supabase.from("email_preferences").upsert({
      user_id: user.id,
      daily_enabled,
      daily_time,
      weekly_enabled,
      weekly_dow,
      timezone: "Asia/Kolkata",
      updated_at: new Date().toISOString(),
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
  return NextResponse.redirect(new URL("/settings?saved=1", req.url), 303);
}
