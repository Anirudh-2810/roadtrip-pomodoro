"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { signupSchema } from "@/lib/validation";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getGuestSessions, clearGuestSessions } from "@/lib/guest";

type Form = z.infer<typeof signupSchema>;

export default function SignupPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(signupSchema) });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [successEmail, setSuccessEmail] = useState("");
  const [successMocked, setSuccessMocked] = useState(false);

  const onSubmit = async (data: Form) => {
    setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/auth/signup", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const j = await res.json().catch(() => ({})) as { error?: string; mocked?: boolean };
      if (!res.ok) throw new Error(j.error ?? "Signup failed");
      setSuccessEmail(data.email);
      setSuccessMocked(!!j.mocked);
      setShowSuccess(true);
      // try guest claim (best effort, after popup shown)
      const guest = getGuestSessions();
      if (guest.length) {
        const c = await fetch("/api/guest/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessions: guest }) });
        const cj = await c.json().catch(() => ({})) as { error?: string };
        if (c.ok) {
          clearGuestSessions();
          setMsg(`✓ ${guest.length} guest sessions synced.`);
        } else {
          setMsg(`Guest sync: ${cj.error ?? "skipped"}.`);
        }
      }
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={()=> setShowSuccess(false)}>
          <div onClick={e=> e.stopPropagation()} className="w-full max-w-sm rounded-2xl border border-emerald-500/20 bg-[#1A1E23] p-6 text-center shadow-2xl">
            <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-400 text-xl">✓</div>
            <h3 className="mt-3 text-lg font-bold text-white">Successfully signed up</h3>
            <p className="mt-1 text-sm text-zinc-400">
              {successMocked ? (
                <>Account mocked — Supabase not configured yet. You can <b className="text-white">continue as guest</b> until env is set.</>
              ) : (
                <>Verification email sent to <b className="text-white break-all">{successEmail}</b> — check inbox & spam.</>
              )}
            </p>
            {!successMocked && <p className="mt-2 text-xs text-zinc-500">Click the link in the email to verify, then log in. Guest sessions (if any) will sync on login.</p>}
            {msg && <p className="mt-3 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-xs text-zinc-300">{msg}</p>}
            <div className="mt-5 flex gap-2">
              {!successMocked ? (
                <>
                  <button onClick={()=> { setShowSuccess(false); router.push("/login"); }} className="flex-1 rounded-full bg-[#00E69A] py-2.5 text-sm font-bold text-[#00140e]">Go to login →</button>
                  <button onClick={()=> setShowSuccess(false)} className="rounded-full border border-white/10 px-4 py-2.5 text-sm text-zinc-400">Stay</button>
                </>
              ) : (
                <>
                  <button onClick={()=> { setShowSuccess(false); router.push("/"); router.refresh(); }} className="flex-1 rounded-full bg-white py-2.5 text-sm font-bold text-black">Continue as guest →</button>
                  <button onClick={()=> setShowSuccess(false)} className="rounded-full border border-white/10 px-4 py-2.5 text-sm text-zinc-400">Stay</button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
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
