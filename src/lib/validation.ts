import { z } from "zod";

export const signupSchema = z.object({
  email: z.string().email("Invalid email").max(254),
  password: z
    .string()
    .min(8, "Password must be 8+ chars")
    .max(128)
    .regex(/[A-Z]/, "Need uppercase")
    .regex(/[a-z]/, "Need lowercase")
    .regex(/[0-9]/, "Need number"),
  intent: z.string().max(200).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const sessionSchema = z.object({
  started_at: z.string(),
  finished_at: z.string(),
  duration_sec: z.number().int().min(1).max(10800),
  preset: z.string().max(20),
  intent: z.string().max(200).optional(),
  completed: z.boolean(),
  route: z.string().max(30).optional(),
});

export const guestClaimSchema = z.object({
  sessions: z.array(sessionSchema).max(500),
});

export const emailPrefSchema = z.object({
  daily_enabled: z.boolean(),
  daily_time: z.string().regex(/^\d{2}:\d{2}$/),
  weekly_enabled: z.boolean(),
  weekly_dow: z.number().int().min(0).max(6),
  timezone: z.string().max(50),
});

export function parsePreset(input: string): number | null {
  // accepts mm:ss or plain minutes
  const s = input.trim();
  if (/^\d{1,3}:\d{2}$/.test(s)) {
    const [m, sec] = s.split(":").map(Number);
    if (sec >= 60) return null;
    const total = m * 60 + sec;
    if (total < 60 || total > 10800) return null;
    return total;
  }
  if (/^\d{1,3}$/.test(s)) {
    const total = Number(s) * 60;
    if (total < 60 || total > 10800) return null;
    return total;
  }
  return null;
}
