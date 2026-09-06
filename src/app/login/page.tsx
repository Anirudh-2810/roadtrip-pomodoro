"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@/lib/validation";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Form = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(loginSchema) });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [showSuccess, setShowSuccess] = useState(false);
  const [loggedEmail, setLoggedEmail] = useState<string>("");

  const onSubmit = async (data: Form) => {
    setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Login failed");
      setLoggedEmail(data.email);
      setShowSuccess(true);
      setMsg(null);
      // refresh server components so layout/page see auth cookies
      router.refresh();
      setTimeout(()=> { router.push("/"); router.refresh(); }, 1200);
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
            <h3 className="mt-3 text-lg font-bold text-white">Logged in successfully</h3>
            <p className="mt-1 text-sm text-zinc-400">Welcome back — <b className="text-white">{loggedEmail}</b></p>
            <p className="mt-2 text-xs text-zinc-500">Redirecting to your road…</p>
            <div className="mt-4 flex gap-2">
              <button onClick={()=> { router.push("/"); router.refresh(); }} className="flex-1 rounded-full bg-[#00E69A] py-2 text-sm font-bold text-[#00140e]">Hit the road →</button>
              <button onClick={()=> setShowSuccess(false)} className="rounded-full border border-white/10 px-4 py-2 text-sm text-zinc-400">Stay</button>
            </div>
          </div>
        </div>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">Log in</h1>
      <p className="mt-1 text-sm text-zinc-500">Welcome back. Or <a href="/" className="text-emerald-400 hover:underline">continue without signup →</a></p>
      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-3">
        <div>
          <label className="text-xs text-zinc-400">Email</label>
          <Input type="email" placeholder="you@college.edu" {...register("email")} />
          {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email.message}</p>}
        </div>
        <div>
          <label className="text-xs text-zinc-400">Password</label>
          <Input type="password" placeholder="••••••••" {...register("password")} />
          {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password.message}</p>}
        </div>
        <Button type="submit" disabled={isSubmitting} className="w-full">{isSubmitting ? "Logging in…" : "Log in"}</Button>
        <div className="flex gap-2">
          <a href="/signup" className="flex-1 text-center rounded-full border border-white/10 py-2 text-sm text-zinc-400 hover:bg-white/10">Create account</a>
          <a href="/" className="flex-1 text-center rounded-full border border-white/10 py-2 text-sm text-zinc-400 hover:bg-white/10">Continue without signup →</a>
        </div>
        {msg && <p className="rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 text-xs text-emerald-300">{msg}</p>}
        {err && <p className="rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2 text-xs text-red-300">{err}</p>}
      </form>
      <p className="mt-4 text-center text-xs text-zinc-600"><a href="/forgot-password" className="hover:text-zinc-400">Forgot password?</a></p>
    </div>
  );
}
