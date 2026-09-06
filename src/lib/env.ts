import { z } from "zod";

// Validates env at build/runtime — never expose secrets to client
const serverSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(10).optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(10).optional(),
  RESEND_API_KEY: z.string().min(5).optional(),
  RESEND_FROM: z.string().optional(),
  AUTH_SECRET: z.string().min(16).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(10).optional(),
  CSRF_SECRET: z.string().min(16).optional(),
});

export type Env = z.infer<typeof serverSchema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    // do not throw on missing optional env — only warn, let /api/health report
    // but validate format if present
    console.warn("[env] validation warning", parsed.error.flatten());
    cached = process.env as unknown as Env;
    return cached;
  }
  cached = parsed.data;
  return cached;
}

// Helpers — never return secret values to client
export function isSupabaseConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.NEXT_PUBLIC_SUPABASE_URL && e.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
export function isResendConfigured(): boolean {
  return Boolean(getEnv().RESEND_API_KEY);
}
export function isRedisConfigured(): boolean {
  const e = getEnv();
  return Boolean(e.UPSTASH_REDIS_REST_URL && e.UPSTASH_REDIS_REST_TOKEN);
}

// Public-safe health (no values)
export function healthEnv() {
  return {
    supabase: isSupabaseConfigured(),
    resend: isResendConfigured(),
    redis: isRedisConfigured(),
  };
}
