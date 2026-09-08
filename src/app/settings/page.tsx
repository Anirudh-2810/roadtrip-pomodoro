import { getUser } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export default async function SettingsPage() {
  const user = await getUser();
  // Logged out → explainer (email prefs are account-side; guests get no emails)
  if (!user) {
    return (
      <div className="mx-auto max-w-xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Email settings</h1>
        <p className="mt-1 text-sm text-zinc-500">Auto per Pomodoro + digests. Unsubscribe is instant.</p>
        <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-5 text-center">
          <div className="text-sm text-zinc-300">Emails need an account — guests don&apos;t get emails.</div>
          <p className="mt-1 text-xs text-zinc-500">Sign up to get a mail per completed session plus daily 22:00 IST + weekly digests.</p>
          <div className="mt-4 flex gap-2">
            <a href="/signup" className="flex-1 rounded-full bg-white py-2.5 text-sm font-medium text-black hover:bg-zinc-200">Create account</a>
            <a href="/login" className="flex-1 rounded-full border border-white/10 py-2.5 text-sm text-zinc-300 hover:bg-white/10">Log in</a>
          </div>
        </div>
        <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-zinc-500">
          <div className="font-medium text-zinc-400">What you&apos;d get</div>
          <ul className="list-disc pl-4 mt-1 space-y-0.5">
            <li>a) Each completed focus session → immediate email</li>
            <li>b) Daily + weekly digest (toggleable after signup)</li>
          </ul>
        </div>
      </div>
    );
  }
  const csrf = (await cookies()).get("__Host-csrf")?.value ?? "";

  let prefs: { daily_enabled: boolean; daily_time: string; weekly_enabled: boolean; weekly_dow: number } | null = null;
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const supabaseUnknown = supabase as unknown as {
      from: (t: string) => {
        select: (s: string) => {
          eq: (c: string, v: string) => {
            single: () => Promise<{ data: unknown }>;
          };
        };
      };
    };
    const { data } = await supabaseUnknown.from("email_preferences").select("*").eq("user_id", user.id).single();
    prefs = data as typeof prefs;
  } catch {}

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Email settings</h1>
      <p className="mt-1 text-sm text-zinc-500">Auto per Pomodoro + digests. Unsubscribe is instant.</p>

      <form
        action="/api/email/preferences"
        method="post"
        className="mt-6 space-y-4 rounded-xl border border-white/10 bg-white/[0.03] p-4"
      >
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="daily_enabled" defaultChecked={(prefs as unknown as { daily_enabled?: boolean })?.daily_enabled ?? true} className="h-4 w-4 rounded border-white/20 bg-white/10" />
          <span className="text-white">Daily digest</span>
          <span className="text-zinc-500">22:00 IST</span>
          <input name="daily_time" defaultValue={(prefs as unknown as { daily_time?: string })?.daily_time ?? "22:00"} className="ml-auto w-20 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="weekly_enabled" defaultChecked={(prefs as unknown as { weekly_enabled?: boolean })?.weekly_enabled ?? true} className="h-4 w-4 rounded border-white/20 bg-white/10" />
          <span className="text-white">Weekly digest</span>
          <span className="text-zinc-500">Sunday 09:00 IST</span>
        </label>
        <input type="hidden" name="weekly_dow" value="0" />
        <input type="hidden" name="_csrf" value={csrf} />
        <button type="submit" className="w-full rounded-full bg-white py-2.5 text-sm font-medium text-black hover:bg-zinc-200">
          Save preferences
        </button>
        <p className="text-center text-[11px] text-zinc-600">Emails via Resend from {process.env.RESEND_FROM ?? "onboarding@resend.dev"} — check spam if missing.</p>
      </form>

      <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-zinc-500">
        <div className="font-medium text-zinc-400">What we send</div>
        <ul className="list-disc pl-4 mt-1 space-y-0.5">
          <li>a) Each completed focus session → immediate email (disable by unchecking? We keep it always on — toggle coming)</li>
          <li>b) Daily + weekly digest (toggle above)</li>
        </ul>
      </div>
    </div>
  );
}
