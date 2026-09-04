import PomodoroTimer from "@/components/timer/PomodoroTimer";
import { getUser } from "@/lib/supabase/server";

export default async function Home() {
  const user = await getUser();
  const email = user?.email ?? null;

  const supabaseOk = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const resendOk = Boolean(process.env.RESEND_API_KEY);

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6 py-8 sm:py-12">
      {/* hero */}
      <div className="mx-auto max-w-2xl text-center mb-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Production · Vercel + Supabase + Resend
        </div>
        <h1 className="mt-4 text-3xl sm:text-4xl font-semibold tracking-tight">Deep work, emailed.</h1>
        <p className="mt-2 text-sm leading-6 text-zinc-400">
          Pomodoro timer that <span className="text-white">auto-emails each finish</span> + daily/weekly digest. Use as guest —{" "}
          <a href="/signup" className="text-emerald-400 hover:underline">continue without signup</a> — sync later.
        </p>
        {!supabaseOk && (
          <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-2.5 text-xs text-amber-200">
            Setup needed: add <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_URL</code> + <code className="rounded bg-black/30 px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> in Vercel env (see <code className="rounded bg-black/30 px-1">.env.example</code>). App runs in guest mode until configured.
          </div>
        )}
        {!resendOk && supabaseOk && (
          <div className="mt-3 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-xs text-zinc-400">Email (Resend) not configured — timer & dashboard work, emails queued after you add <code className="rounded bg-black/30 px-1">RESEND_API_KEY</code>.</div>
        )}
      </div>

      <PomodoroTimer userEmail={email} />

      <div className="mx-auto max-w-[640px] mt-6 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="font-medium text-white">a) Auto per Pomodoro</div>
          <div className="text-zinc-500">Each completed session → email to you (Resend, idempotent).</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="font-medium text-white">b) Digest</div>
          <div className="text-zinc-500">Daily 22:00 IST + weekly digest via pg_cron.</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="font-medium text-white">Guest → Sync</div>
          <div className="text-zinc-500">Continue without signup, claim 500 sessions on signup.</div>
        </div>
      </div>
    </div>
  );
}
