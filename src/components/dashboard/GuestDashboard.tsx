"use client";
import { useEffect, useState } from "react";
import { getGuestSessions, guestStats, type GuestSession } from "@/lib/guest";
import { formatIST } from "@/lib/datetime";

// Logged-out dashboard — reads browser-local guest sessions only.
// No API calls, no account needed. Mirrors the authed dashboard style.
export default function GuestDashboard() {
  const [rows, setRows] = useState<GuestSession[]>([]);
  const [stats, setStats] = useState({ completed: 0, totalMin: 0, streak: 0 });

  useEffect(() => {
    setRows(getGuestSessions().slice(0, 50));
    setStats(guestStats());
  }, []);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <span className="text-xs text-zinc-500">guest mode · this browser only</span>
      </div>

      <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-xs text-zinc-300">
        You&apos;re browsing as a guest — stats below are from this browser only.{" "}
        <a href="/signup" className="text-emerald-400 hover:underline">Create an account →</a>{" "}
        to back them up, get per-session emails, and sync guest sessions (up to 500).
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
          <a href="/" className="text-xs text-emerald-400 hover:underline">Hit the timer →</a>
        </div>
        {rows.length === 0 ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            No sessions yet — <a href="/" className="text-emerald-400 hover:underline">hit the timer →</a>
            <div className="mt-2 text-[11px]">Guest sessions stay in this browser until you sign up and claim them.</div>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center justify-between px-4 py-2.5 text-xs">
                <span className="font-mono text-white">{formatIST(r.started_at)} · {Math.round(r.duration_sec / 60)}m · {r.preset}</span>
                <span className="text-zinc-500 truncate max-w-[160px]">{r.intent ?? "—"}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] ${r.completed ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-zinc-500"}`}>{r.completed ? "done" : "break"}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
