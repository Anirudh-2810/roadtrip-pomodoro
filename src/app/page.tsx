import { getUser } from "@/lib/supabase/server";
import RoadtripExperience from "@/components/roadtrip/RoadtripExperience";

export default async function Home() {
  const user = await getUser();
  const email = user?.email ?? null;

  const supabaseOk = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const resendOk = Boolean(process.env.RESEND_API_KEY);

  return (
    <div className="min-h-screen">
      {/* compact top banner — road is the hero now */}
      <div className="mx-auto max-w-6xl px-4 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-2 text-[11px]">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-zinc-400">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> Production · endless road + email + guest sync · 60 fps
        </div>
        <div className="flex items-center gap-2">
          <a href="/dashboard" className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/10">Dashboard</a>
          <a href="/settings" className="rounded-full border border-white/10 px-3 py-1 hover:bg-white/10">Settings</a>
          {!supabaseOk && <span className="rounded-full bg-amber-500/15 border border-amber-500/20 px-3 py-1 text-amber-200">Guest mode — add Supabase env to sync</span>}
          {supabaseOk && !resendOk && <span className="rounded-full bg-white/5 border border-white/10 px-3 py-1 text-zinc-400">Email queued — add RESEND_API_KEY</span>}
        </div>
      </div>

      <RoadtripExperience userEmail={email} />
    </div>
  );
}
