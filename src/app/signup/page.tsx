"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema } from "@/lib/validation";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getGuestSessions, clearGuestSessions } from "@/lib/guest";

type Form = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(signupSchema) });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (data: Form) => {
    setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Signup failed");
      // try guest claim
      const guest = getGuestSessions();
      if (guest.length) {
        const c = await fetch("/api/guest/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessions: guest }) });
        const cj = await c.json().catch(() => ({}));
        if (c.ok) {
          clearGuestSessions();
          setMsg(`Account created! ${guest.length} guest sessions synced. Check email to verify.`);
        } else {
          setMsg(`Account created! Guest sync: ${cj.error ?? "skipped"}. Verify email to log in.`);
        }
      } else {
        setMsg("Account created — check email to verify, then log in.");
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Create account</h1>
      <p className="mt-1 text-sm text-zinc-500">Get auto-email per Pomodoro + digests. Or <a href="/" className="text-emerald-400 hover:underline">continue without signup →</a></p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-3">
        <div>
          <label className="text-xs text-zinc-400">Email</label>
          <Input type="email" placeholder="you@college.edu" {...register("email")} />
          {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <label className="text-xs text-zinc-400">Password (8+, upper+lower+number)</label>
          <Input type="password" placeholder="••••••••" {...register("password")} />
          {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>}
        </div>
        <Button type="submit" disabled={isSubmitting} className="w-full">{isSubmitting ? "Creating…" : "Sign up"}</Button>
        <div className="flex gap-2">
          <a href="/login" className="flex-1 text-center rounded-full border border-white/10 py-2 text-sm text-zinc-400 hover:bg-white/10">Have account? Log in</a>
          <a href="/" className="flex-1 text-center rounded-full border border-white/10 py-2 text-sm text-zinc-400 hover:bg-white/10">Continue without signup →</a>
        </div>
        {msg && <p className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-300">{msg}</p>}
        {err && <p className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">{err}</p>}
      </form>
      <div className="mt-6 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-[11px] text-zinc-500">
        <div className="font-medium text-zinc-400">What you get</div>
        <ul className="list-disc pl-4 mt-1 space-y-0.5">
          <li>Auto-email each completed Pomodoro (Resend)</li>
          <li>Daily 22:00 IST + weekly digest</li>
          <li>Dashboard + streaks, guest sessions claimed (500 max)</li>
        </ul>
      </div>
    </div>
  );
}
