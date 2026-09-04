import { getUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const user = await getUser();
  if (!user) redirect("/login");

  // Fetch sessions if supabase configured — otherwise show guest nudge
  let rows: Array<{ started_at: string; preset: string; duration_sec: number; intent?: string; completed: boolean }> = [];
  let stats = { completed: 0, totalMin: 0, streak: 0 };
  try {
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();
    const { data } = await supabase
      .from("sessions")
      .select("started_at,preset,duration_sec,intent,completed")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false })
      .limit(50);
    rows = (data as typeof rows) ?? [];
    const completed = rows.filter((r) => r.completed).length;
    const totalMin = Math.round(rows.reduce((a, r) => a + r.duration_sec, 0) / 60);
    stats = { completed, totalMin, streak: 0 };
  } catch {
    // supabase not configured or table missing — show empty
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <span className="text-xs text-zinc-500">{user.email}</span>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
          <div className="text-lg font-mono font-bold text-white">{stats.completed}</div>
          <div className="text-[11px] text-zinc-500">completed</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
          <div className="text-lg font-mono font-bold text-white">{stats.totalMin}m</div>
          <div className="text-[11px] text-zinc-500">total</div>
        </div>
        <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-center">
          <div className="text-lg font-mono font-bold text-white">{stats.streak}</div>
          <div className="text-[11px] text-zinc-500">streak</div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-4 py-2 border-b border-white/10 flex items-center justify-between">
          <span className="text-xs font-medium text-zinc-400">Recent sessions</span>
          <a href="/settings" className="text-xs text-emerald-400 hover:underline">Email settings →</a>
        </div>
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            No sessions yet — <a href="/" className="text-emerald-400 hover:underline">hit the timer →</a>
            <div className="mt-2 text-[11px]">If Supabase isn’t configured, add env vars then create tables via <code className="rounded bg-white/10 px-1">supabase/migrations/001_init.sql</code></div>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="font-mono text-white">{r.started_at.slice(0, 16).replace("T", " ")} · {Math.round(r.duration_sec / 60)}m · {r.preset}</span>
                <span className="text-zinc-500 truncate max-w-[160px]">{r.intent ?? "—"}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${r.completed ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-zinc-500"}`}>{r.completed ? "done" : "break"}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <form action="/api/auth/logout" method="post" className="mt-6">
        <button type="submit" className="rounded-full border border-white/10 px-4 py-2 text-xs text-zinc-400 hover:bg-white/10">
          Log out
        </button>
      </form>
    </div>
  );
}
