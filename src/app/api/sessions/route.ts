import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { sessionSchema } from "@/lib/validation";
import { rateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized — log in or continue as guest" }, { status: 401 });

  const rl = rateLimit(`sessions:${user.id}`, 60, 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429 });

  const body = await req.json().catch(() => null);
  const parsed = sessionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid session" }, { status: 400 });

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    // if no table, just ack — lets guest flow dev without supabase
    return NextResponse.json({ ok: true, mocked: true });
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.from("sessions").insert({
      user_id: user.id,
      started_at: parsed.data.started_at,
      finished_at: parsed.data.finished_at,
      duration_sec: parsed.data.duration_sec,
      preset: parsed.data.preset,
      intent: parsed.data.intent ?? null,
      completed: parsed.data.completed,
      route: parsed.data.route ?? parsed.data.preset,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(100);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ rows: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
