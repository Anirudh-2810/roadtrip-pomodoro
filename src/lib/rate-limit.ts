// Hybrid rate limiter: Upstash Redis if configured, else in-memory fallback
// Configured via UPSTASH_REDIS_REST_URL/TOKEN — falls back silently for local/dev
type Bucket = { count: number; reset: number };
const store = new Map<string, Bucket>();

// In-memory bucket (fallback)
function memRateLimit(
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

// Redis-backed via REST (edge-compatible fetch)
async function redisRateLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; remaining: number; reset: number } | null> {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  try {
    const now = Date.now();
    const windowId = Math.floor(now / windowMs);
    const rkey = `rl:${key}:${windowId}`;
    // INCR + PEXPIRE pipeline
    const res = await fetch(`${url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify([
        ["INCR", rkey],
        ["PEXPIRE", rkey, String(windowMs)],
        ["TTL", rkey],
      ]),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ result: number }>;
    const count = Number(data?.[0]?.result ?? 1);
    const ttlMs = Number(data?.[2]?.result ?? -1);
    const reset = ttlMs > 0 ? now + ttlMs * 1000 : now + windowMs;
    if (count > limit) return { ok: false, remaining: 0, reset };
    return { ok: true, remaining: Math.max(0, limit - count), reset };
  } catch {
    return null;
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; remaining: number; reset: number } {
  return memRateLimit(key, limit, windowMs);
}

export async function rateLimitAsync(
  key: string,
  limit: number,
  windowMs: number
): Promise<{ ok: boolean; remaining: number; reset: number }> {
  const redis = await redisRateLimit(key, limit, windowMs);
  if (redis) return redis;
  return memRateLimit(key, limit, windowMs);
}

// cleanup every 10m (in-mem only)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of store.entries()) if (now > v.reset) store.delete(k);
  }, 10 * 60 * 1000).unref?.();
}
