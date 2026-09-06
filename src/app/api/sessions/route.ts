import { NextRequest, NextResponse } from "next/server";
import { createClient, getUser } from "@/lib/supabase/server";
import { sessionSchema } from "@/lib/validation";
import { rateLimitAsync } from "@/lib/rate-limit";
import { getClientIp, readJsonWithLimit, jsonError } from "@/lib/security";
import { checkCsrf } from "@/lib/csrf";

export async function POST(req: NextRequest) {
  // body size guard
  if ((req.headers.get("content-length") && Number(req.headers.get("content-length")) > 8 * 1024) || req.headers.get("content-type")?.includes("application/json") === false) {
    // allow missing content-type for compat, but still limit
  }
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized — log in or continue as guest" }, { status: 401 });

  const ip = getClientIp(req);
  const rl = await rateLimitAsync(`sessions:${user.id}:${ip}`, 60, 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited" }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } });

  // CSRF double-submit for state-changing
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
