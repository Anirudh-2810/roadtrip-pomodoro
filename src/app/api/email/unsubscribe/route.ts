import { NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/supabase/server";
import { createHmac, timingSafeEqual } from "crypto";

// HMAC unsubscribe link: /api/email/unsubscribe?u=<userId>&exp=<ts>&sig=<hmac>
function sign(userId: string, exp: string, secret: string): string {
  return createHmac("sha256", secret).update(`${userId}:${exp}`).digest("hex").slice(0, 32);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const u = url.searchParams.get("u");
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  const secret = process.env.AUTH_SECRET ?? process.env.CSRF_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  // Authenticated path: user disables via settings — also allow HMAC link without login
  if (u && exp && sig) {
    const expN = Number(exp);
    if (!Number.isFinite(expN) || Date.now() > expN) {
      return new NextResponse("Link expired", { status: 400 });
    }
    const expected = sign(u, exp, secret);
    try {
      if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
        return new NextResponse("Invalid link", { status: 403 });
      }
    } catch {
      return new NextResponse("Invalid link", { status: 403 });
    }
    // set preference off via service client is not allowed without auth — show page
    return new NextResponse(
      `<!doctype html><meta charset="utf-8"><title>Unsubscribe</title><body style="font-family:system-ui;padding:32px;max-width:560px;margin:auto;background:#09090B;color:#fafafa"><h1>Unsubscribe</h1><p>Click to disable daily/weekly digests for this account.</p><form method="POST" action="/api/email/unsubscribe"><input type="hidden" name="u" value="${u}"/><input type="hidden" name="exp" value="${exp}"/><input type="hidden" name="sig" value="${sig}"/><button style="padding:10px 16px;background:#10b981;color:#00140e;border:none;border-radius:999px;font-weight:700">Confirm unsubscribe</button></form>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
  // If logged in, show confirm
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized — use unsubscribe link from email" }, { status: 401 });
  return new NextResponse(
    `<!doctype html><meta charset="utf-8"><title>Unsubscribe</title><body style="font-family:system-ui;padding:32px;max-width:560px;margin:auto;background:#09090B;color:#fafafa"><h1>Unsubscribe</h1><p>Disable daily/weekly digests?</p><form method="POST"><button style="padding:10px 16px;background:#10b981;color:#00140e;border:none;border-radius:999px;font-weight:700">Disable digests</button></form><p><a href="/settings" style="color:#10b981">Manage in Settings</a></p>`,
    { headers: { "Content-Type": "text/html" } }
  );
}

export async function POST(req: NextRequest) {
  const secret = process.env.AUTH_SECRET ?? process.env.CSRF_SECRET;
  if (!secret) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  const ct = req.headers.get("content-type") ?? "";
  let u: string | null = null;
  let exp: string | null = null;
  let sig: string | null = null;
  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const form = await req.formData();
    u = (form.get("u") as string) ?? null;
    exp = (form.get("exp") as string) ?? null;
    sig = (form.get("sig") as string) ?? null;
  }
  // Try HMAC path first
  if (u && exp && sig) {
    const expN = Number(exp);
    if (!Number.isFinite(expN) || Date.now() > expN) return NextResponse.json({ error: "Link expired" }, { status: 400 });
    const expected = sign(u, exp, secret);
    try {
      if (!timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
        return NextResponse.json({ error: "Invalid link" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Invalid link" }, { status: 403 });
    }
    // HMAC path would need service role to update by userId — for now return success and instruct to login
    // We still allow it if service key present via direct DB
    try {
      const { createServiceClient } = await import("@/lib/supabase/server");
      const supa = await createServiceClient();
      await supa.from("email_preferences").upsert({ user_id: u, daily_enabled: false, weekly_enabled: false });
      return new NextResponse("Unsubscribed — daily/weekly digests disabled.", { headers: { "Content-Type": "text/plain" } });
    } catch {
      return NextResponse.json({ error: "Could not update — please log in and use Settings" }, { status: 500 });
    }
  }
  // Authed path
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supa = await createClient();
    await supa.from("email_preferences").upsert({ user_id: user.id, daily_enabled: false, weekly_enabled: false });
    return NextResponse.redirect(new URL("/settings?unsubscribed=1", req.url));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// Helper to generate HMAC link server-side (not exported as route handler)
function makeUnsubscribeLink(userId: string, baseUrl: string): string {
  const secret = process.env.AUTH_SECRET ?? process.env.CSRF_SECRET ?? "dev-secret-change-me-32chars!!";
  const exp = String(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const sig = sign(userId, exp, secret);
  return `${baseUrl}/api/email/unsubscribe?u=${encodeURIComponent(userId)}&exp=${exp}&sig=${sig}`;
}
void makeUnsubscribeLink;
