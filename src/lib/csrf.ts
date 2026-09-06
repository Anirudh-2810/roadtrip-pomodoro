import { randomBytes, createHmac, timingSafeEqual } from "crypto";

const COOKIE_NAME = "__Host-csrf";
const HEADER_NAME = "x-csrf-token";
const TOKEN_BYTES = 32;

// Generate token: random + optional HMAC binding if secret set
export function generateCsrfToken(secret?: string): string {
  const rnd = randomBytes(TOKEN_BYTES).toString("hex");
  if (!secret) return rnd;
  const sig = createHmac("sha256", secret).update(rnd).digest("hex").slice(0, 16);
  return `${rnd}.${sig}`;
}

export function validateCsrfToken(token: string | null | undefined, secret?: string): boolean {
  if (!token || typeof token !== "string") return false;
  if (token.length < 32) return false;
  if (!secret) {
    // without secret, just check hex format
    return /^[a-f0-9]{64}(\.[a-f0-9]{16})?$/.test(token);
  }
  const [rnd, sig] = token.split(".");
  if (!rnd || !sig) return false;
  if (!/^[a-f0-9]{64}$/.test(rnd) || !/^[a-f0-9]{16}$/.test(sig)) return false;
  const expected = createHmac("sha256", secret).update(rnd).digest("hex").slice(0, 16);
  try {
    return timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"));
  } catch {
    return false;
  }
}

export function getCsrfCookieName(): string {
  return COOKIE_NAME;
}
export function getCsrfHeaderName(): string {
  return HEADER_NAME;
}

// For API routes: check header vs cookie
export function checkCsrf(req: Request, cookieToken: string | null | undefined): boolean {
  const header = req.headers.get(HEADER_NAME) ?? req.headers.get(HEADER_NAME.toLowerCase());
  if (!header || !cookieToken) return false;
  // double-submit: header must equal cookie
  if (header !== cookieToken) return false;
  const secret = process.env.CSRF_SECRET ?? process.env.AUTH_SECRET;
  return validateCsrfToken(header, secret);
}
