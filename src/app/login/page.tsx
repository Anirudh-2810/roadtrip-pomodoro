"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { loginSchema } from "@/lib/validation";
import { z } from "zod";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Form = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm<Form>({ resolver: zodResolver(loginSchema) });
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const onSubmit = async (data: Form) => {
    setErr(null); setMsg(null);
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "Login failed");
      setMsg("Logged in — redirecting to dashboard…");
      window.location.href = "/dashboard";
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto max-w-md px-4 py-10">
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
