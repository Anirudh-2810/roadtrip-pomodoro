import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid form" }, { status: 400 });
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
