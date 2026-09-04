import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { sendSessionEmail } from "@/lib/email";
import { rateLimit } from "@/lib/rate-limit";
import { z } from "zod";

const bodySchema = z.object({
  to: z.string().email(),
  duration_sec: z.number().int().min(1).max(10800),
  preset: z.string().max(20),
  intent: z.string().max(200).optional(),
  completed: z.boolean(),
});

export async function POST(req: NextRequest) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // enforce to = own email unless we later allow share
  const body = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  if (parsed.data.to.toLowerCase() !== (user.email ?? "").toLowerCase()) {
    return NextResponse.json({ error: "Can only email your verified address" }, { status: 403 });
  }

  const rl = rateLimit(`email-session:${user.id}`, 5, 60 * 1000);
  if (!rl.ok) return NextResponse.json({ error: "Rate limited — 5/min" }, { status: 429 });

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
