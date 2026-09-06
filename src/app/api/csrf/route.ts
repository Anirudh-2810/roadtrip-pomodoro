import { NextResponse } from "next/server";
import { generateCsrfToken } from "@/lib/csrf";

// GET issues a double-submit token (idempotent)
export async function GET() {
  const token = generateCsrfToken(process.env.CSRF_SECRET ?? process.env.AUTH_SECRET);
  const res = NextResponse.json({ csrf: token });
  res.cookies.set("__Host-csrf", token, {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
