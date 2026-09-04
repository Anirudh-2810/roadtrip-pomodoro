"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { parsePreset } from "@/lib/validation";
import { saveGuestSession, getGuestSessions, guestStats } from "@/lib/guest";

type Preset = { label: string; work: number; breakSec: number };

const PRESETS: Preset[] = [
  { label: "25/5", work: 25 * 60, breakSec: 5 * 60 },
  { label: "50/10", work: 50 * 60, breakSec: 10 * 60 },
  { label: "15/3", work: 15 * 60, breakSec: 3 * 60 },
];

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export default function PomodoroTimer({
  userEmail,
}: {
  userEmail?: string | null;
}) {
  const [preset, setPreset] = useState<Preset>(PRESETS[0]);
  const [custom, setCustom] = useState("");
  const [intent, setIntent] = useState("");
  const [remaining, setRemaining] = useState(PRESETS[0].work);
  const [total, setTotal] = useState(PRESETS[0].work);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [isBreak, setIsBreak] = useState(false);
  const [stats, setStats] = useState({ totalMin: 0, completed: 0, streak: 0 });
  const startedAtRef = useRef<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const lastTickRef = useRef<number>(Date.now());

  // stats
  useEffect(() => {
    setStats(guestStats());
  }, [running]);

  // Worker for drift-free tick (fallback to setTimeout if Worker unavailable)
  useEffect(() => {
    if (typeof window === "undefined") return;
    // simple tick via setInterval fallback — Worker file not needed for MVP
    if (!running || paused) return;
    const id = window.setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          window.clearInterval(id);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [running, paused]);

  const handleFinish = useCallback(async () => {
    const duration = total;
    const started = startedAtRef.current ?? new Date(Date.now() - duration * 1000).toISOString();
    const finished = new Date().toISOString();
    const row = {
      started_at: started,
      finished_at: finished,
      duration_sec: duration,
      preset: isBreak ? `break-${preset.label}` : preset.label,
      intent: intent || undefined,
      completed: !isBreak,
      route: preset.label,
    };
    // guest save (always)
    saveGuestSession(row);
    setStats(guestStats());

    // if authed, POST to api/sessions and trigger email
    if (userEmail) {
      try {
        const res = await fetch("/api/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(row),
        });
        if (res.ok && !isBreak) {
          // fire-and-forget email a
          fetch("/api/email/session", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ to: userEmail, ...row }),
          }).catch(() => {});
        }
      } catch {}
    } else if (!isBreak) {
      // guest nudge
      // no email — show toast via alert
    }

    // notify
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(isBreak ? "Break over — ready to focus?" : "Journey completed ✓", {
        body: `${preset.label} · ${Math.round(duration / 60)}m — ${intent || "focus session"}`,
      });
    } else if ("Notification" in window && Notification.permission !== "denied") {
      Notification.requestPermission().catch(() => {});
    }
    // beep
    try {
      const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = 880;
      g.gain.value = 0.12;
      o.connect(g).connect(ctx.destination);
      o.start();
      setTimeout(() => {
        o.stop();
        ctx.close().catch(() => {});
      }, 650);
    } catch {}

    // toggle break/work
    if (!isBreak) {
      setIsBreak(true);
      const b = preset.breakSec;
      setTotal(b);
      setRemaining(b);
      setRunning(false);
      setPaused(false);
    } else {
      setIsBreak(false);
      setTotal(preset.work);
      setRemaining(preset.work);
      setRunning(false);
      setPaused(false);
    }
  }, [total, isBreak, preset, intent, userEmail]);

  useEffect(() => {
    if (running && !paused && remaining === 0) {
      handleFinish();
    }
  }, [remaining, running, paused, handleFinish]);

  const start = useCallback(() => {
    if (running) return;
    let t = total;
    if (custom.trim()) {
      const parsed = parsePreset(custom);
      if (parsed) {
        t = parsed;
        setTotal(parsed);
        setRemaining(parsed);
      }
    }
    if (t <= 0) return;
    startedAtRef.current = new Date().toISOString();
    lastTickRef.current = Date.now();
    setRunning(true);
    setPaused(false);
  }, [running, total, custom]);

  const pause = useCallback(() => setPaused((p) => !p), []);
  const reset = useCallback(() => {
    setRunning(false);
    setPaused(false);
    setIsBreak(false);
    setTotal(preset.work);
    setRemaining(preset.work);
    startedAtRef.current = null;
  }, [preset]);

  const pct = total ? Math.round(((total - remaining) / total) * 100) : 0;

  return (
    <div className="w-full max-w-[640px] mx-auto rounded-[24px] border border-white/10 bg-[#121212]/80 backdrop-blur-xl p-6 sm:p-8 shadow-2xl">
      {/* guest banner */}
      {!userEmail && (
        <div className="mb-4 flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-xs">
          <span className="text-zinc-400">Guest • Sync to save & email</span>
          <a href="/signup" className="rounded-full bg-white px-3 py-1 font-medium text-black hover:bg-zinc-200">
            Sync to save →
          </a>
        </div>
      )}

      {/* preset pills */}
      <div className="flex flex-wrap gap-2 mb-4">
        {PRESETS.map((p) => (
          <button
            key={p.label}
            onClick={() => {
              if (running) return;
              setPreset(p);
              setTotal(p.work);
              setRemaining(p.work);
              setCustom("");
              setIsBreak(false);
            }}
            className={`rounded-full px-4 py-1.5 text-xs font-medium border transition-colors ${preset.label === p.label && !custom ? "bg-white text-black border-white" : "border-white/10 text-zinc-400 hover:bg-white/10 hover:text-white"}`}
          >
            {p.label}
          </button>
        ))}
        <span className="text-zinc-600 text-xs self-center">· custom mm:ss</span>
      </div>

      {/* intent */}
      <Input
        placeholder="Intent — what does done look like? (e.g. finish math sheet)"
        value={intent}
        onChange={(e) => setIntent(e.target.value)}
        maxLength={200}
        className="mb-4"
      />

      {/* time */}
      <div className="flex items-baseline gap-3 mb-2">
        <div className="text-[56px] font-mono font-extrabold tracking-tight leading-none tabular-nums text-white" style={{ textShadow: "0 0 24px rgba(16,185,129,0.15)" }}>
          {fmt(remaining)}
        </div>
        <span className="text-xs text-zinc-500">{isBreak ? "BREAK" : preset.label} · {pct}%</span>
        <span className="ml-auto text-xs text-zinc-600">{stats.completed} done · {stats.totalMin}m · streak {stats.streak}</span>
      </div>

      {/* custom input */}
      <div className="flex gap-2 mb-3">
        <Input placeholder="Custom mm:ss or minutes (e.g. 45:00 or 45)" value={custom} onChange={(e) => setCustom(e.target.value)} className="flex-1" />
        <Button
          variant="ghost"
          onClick={() => {
            const v = parsePreset(custom);
            if (v) {
              setTotal(v);
              setRemaining(v);
            }
          }}
        >
          Set
        </Button>
      </div>

      {/* meter */}
      <div className="h-1.5 w-full rounded-full bg-white/10 overflow-hidden mb-5">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: "linear-gradient(90deg, #10b981, #059669)", boxShadow: "0 2px 8px rgba(16,185,129,0.25)" }} />
      </div>

      {/* controls */}
      <div className="flex gap-2">
        {!running ? (
          <Button onClick={start} className="flex-1 bg-white text-black hover:bg-zinc-200 h-11 text-sm">
            ▶ Start
          </Button>
        ) : (
          <Button onClick={pause} variant="outline" className="flex-1 h-11">
            {paused ? "▶ Resume" : "⏸ Pause"}
          </Button>
        )}
        <Button onClick={reset} variant="ghost" className="h-11">
          ↻ Reset
        </Button>
        <a href={userEmail ? "/dashboard" : "/signup"} className="inline-flex items-center justify-center rounded-full border border-white/10 px-5 text-sm text-zinc-400 hover:bg-white/10 hover:text-white">
          {userEmail ? "Dashboard" : "Continue without signup →"}
        </a>
      </div>

      {/* tip */}
      <p className="mt-4 text-[11px] leading-5 text-zinc-500">
        Auto-email per Pomodoro + daily/weekly digest when signed in. Guest saves locally (up to 500) — <a href="/signup" className="text-emerald-400 hover:underline">create account to sync & email</a>. Press <kbd className="rounded bg-white/10 px-1 py-0.5">Space</kbd> to start/pause (coming soon).
      </p>

      {/* recent guest rows */}
      {getGuestSessions().length > 0 && (
        <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-3">
          <div className="text-[11px] font-medium text-zinc-400 mb-2">Recent (guest, newest first)</div>
          <div className="space-y-1.5 max-h-40 overflow-auto pr-1">
            {getGuestSessions()
              .slice(0, 5)
              .map((r, i) => (
                <div key={i} className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2 text-xs">
                  <span className="text-white tabular-nums">{Math.round(r.duration_sec / 60)}m · {r.preset}</span>
                  <span className="text-zinc-500 truncate max-w-[180px]">{r.intent ?? "—"}</span>
                  <span className={`text-[10px] rounded-full px-2 py-0.5 ${r.completed ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-zinc-500"}`}>{r.completed ? "done" : "break"}</span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
