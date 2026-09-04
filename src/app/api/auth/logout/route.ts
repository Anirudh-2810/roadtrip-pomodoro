import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch {}
  const url = new URL("/", req.url);
  return NextResponse.redirect(url, 303);
}

export async function GET(req: NextRequest) {
  return POST(req);
}
