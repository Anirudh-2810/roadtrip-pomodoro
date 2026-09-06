import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as "signup" | "recovery" | "email_change" | "invite" | null;
  const next = url.searchParams.get("next") ?? "/dashboard";

  // Ensure next is a relative path to avoid open redirect
  const safeNext = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const redirectTo = new URL(safeNext, url.origin);

  try {
    const supabase = await createClient();
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        // fallback: redirect with error query for UI to show
        redirectTo.searchParams.set("error", error.message);
      }
    } else if (token_hash && type) {
      const { error } = await supabase.auth.verifyOtp({ token_hash, type });
      if (error) {
        redirectTo.searchParams.set("error", error.message);
      }
    }
  } catch {
    // ignore and still redirect
  }

  return NextResponse.redirect(redirectTo);
}
