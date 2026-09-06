import type { NextRequest } from "next/server";

// Central helpers for request validation

export const MAX_JSON_BYTES = 8 * 1024; // 8KB — enough for session/guest claim

export function getClientIp(req: Request | NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "anon";
  const real = (req.headers.get("x-real-ip") ?? "").trim();
  if (real) return real;
  return "anon";
}

export function jsonError(message: string, status: number, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ error: message, ...(extra ?? {}) }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export function isJsonContent(req: Request): boolean {
  const ct = req.headers.get("content-type") ?? "";
  return ct.includes("application/json");
}

export async function readJsonWithLimit<T>(req: Request, limitBytes = MAX_JSON_BYTES): Promise<T | null> {
  const len = req.headers.get("content-length");
  if (len && Number(len) > limitBytes) throw new Error("Payload too large");
  const text = await req.text();
  if (Buffer.byteLength(text, "utf8") > limitBytes) throw new Error("Payload too large");
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("Invalid JSON");
  }
}

// Sanitize intent / preset: trim, limit, strip control chars
export function sanitizeText(s: unknown, maxLen: number): string | undefined {
  if (typeof s !== "string") return undefined;
  let t = s.trim().replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
  if (t.length === 0) return undefined;
  if (t.length > maxLen) t = t.slice(0, maxLen);
  return t;
}

// Nonce for CSP per-request
export function generateNonce(): string {
  // Web Crypto available in edge; fallback to random string
  try {
    const arr = new Uint8Array(16);
    crypto.getRandomValues(arr);
    return Buffer.from(arr).toString("base64");
  } catch {
    // node fallback
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { randomBytes } = require("crypto") as typeof import("crypto");
    return randomBytes(16).toString("base64");
  }
}
