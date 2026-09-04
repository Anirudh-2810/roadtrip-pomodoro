// Simple in-memory rate limiter for prod MVP
// For multi-instance, swap to Upstash Redis (drop-in)
type Bucket = { count: number; reset: number };
const store = new Map<string, Bucket>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number; reset: number } {
  const now = Date.now();
  const cur = store.get(key);
  if (!cur || now > cur.reset) {
    const reset = now + windowMs;
    store.set(key, { count: 1, reset });
    return { ok: true, remaining: limit - 1, reset };
  }
  if (cur.count >= limit) {
    return { ok: false, remaining: 0, reset: cur.reset };
  }
  cur.count += 1;
  return { ok: true, remaining: limit - cur.count, reset: cur.reset };
}

// cleanup every 10m
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store.entries()) if (now > v.reset) store.delete(k);
  }, 10 * 60 * 1000).unref?.();
}
