import { getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/login");

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
