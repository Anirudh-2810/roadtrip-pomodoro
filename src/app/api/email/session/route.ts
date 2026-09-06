import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { sendSessionEmail } from "@/lib/email";
import { rateLimitAsync } from "@/lib/rate-limit";
import { getClientIp, readJsonWithLimit } from "@/lib/security";
import { checkCsrf } from "@/lib/csrf";
import { z } from "zod";

const bodySchema = z.object({
  to: z.string().email().max(254),
  duration_sec: z.number().int().min(1).max(10800),
  preset: z.string().max(20),
  intent: z.string().max(200).optional(),
  completed: z.boolean(),
  started_at: z.string().optional(),
});

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const ip = getClientIp(req);
  const rl = await rateLimitAsync(`email-session:${user.id}:${ip}`, 5, 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited — 5/min" }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.reset - Date.now()) / 1000)) } });

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
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  // enforce to == own verified email — never open relay
  const toLower = parsed.data.to.trim().toLowerCase();
  const userLower = (user.email ?? "").trim().toLowerCase();
  if (toLower !== userLower) {
    return NextResponse.json({ error: "Can only email your verified address" }, { status: 403 });
  }
  // require verified email
  if (!user.email_confirmed_at) {
    return NextResponse.json({ error: "Verify your email before sending" }, { status: 403 });
  }

  const r = await sendSessionEmail({
    to: parsed.data.to,
    durationSec: parsed.data.duration_sec,
    preset: parsed.data.preset,
    intent: parsed.data.intent,
    completed: parsed.data.completed,
  });
  if (r.error) return NextResponse.json({ error: r.error }, { status: 502 });
  // log to email_logs if table exists — best effort
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    await supabase.from("email_logs").insert({
      user_id: user.id,
      type: "session",
      to_email: parsed.data.to,
      status: "sent",
      provider_msg_id: r.id ?? null,
    });
  } catch {}
  return NextResponse.json({ ok: true, id: r.id });
}
