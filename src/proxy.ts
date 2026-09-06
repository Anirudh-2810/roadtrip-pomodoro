import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// CSP nonce per-request — edge-compatible
function generateNonce(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  // base64 without Buffer (edge)
  let s = "";
  for (const b of arr) s += String.fromCharCode(b);
  return btoa(s);
}

export async function proxy(request: NextRequest) {
  const nonce = generateNonce();
  const reqHeaders = new Headers(request.headers);
  reqHeaders.set("x-nonce", nonce);
  // pass nonce to app via request header
  const res = await updateSession(request);
  // attach CSP to response
  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https:`,
    "style-src 'self' 'unsafe-inline' https:",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://*.supabase.co https://api.resend.com https://esm.sh https://unpkg.com",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("x-nonce", nonce);
  // extra hardening
  res.headers.set("Cross-Origin-Opener-Policy", "same-origin");
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|legacy|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
