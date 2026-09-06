import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function NotesPage() {
  let user: { id: string; email?: string | null } | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    const u = data.user as unknown as { id: string; email?: string | null } | null;
    user = u;
  } catch {
    user = null;
  }
  if (!user) redirect("/login");
  const uid = (user as { id: string }).id;
  const uemail = (user as { email?: string | null }).email ?? uid;

  let notes: Array<{ id: string; title: string; created_at: string }> | null = null;
  let error: string | null = null;
  try {
    const supabase = await createClient();
    const res = await supabase.from("notes").select("id,title,created_at").eq("user_id", uid).order("created_at", { ascending: false });
    if (res.error) error = res.error.message;
    else notes = res.data as unknown as typeof notes;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold tracking-tight">Notes — auth only</h1>
      <p className="mt-1 text-xs text-zinc-500">Signed in as <b className="text-zinc-300">{uemail}</b> · RLS <code className="rounded bg-white/10 px-1">auth.uid()=user_id</code> · from <code className="rounded bg-white/10 px-1">public.notes</code></p>
      {error ? (
        <pre className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-xs text-red-300">Error: {error}{"\n"}Hint: run supabase/migrations/002_notes.sql in SQL Editor.</pre>
      ) : (
        <pre className="mt-4 overflow-auto rounded-xl border border-white/10 bg-white/[0.03] p-4 text-xs text-zinc-200">{JSON.stringify(notes, null, 2)}</pre>
      )}
      <p className="mt-3 text-[11px] text-zinc-600">Guide step 5 adapted: import from <code className="rounded bg-white/10 px-1">@/lib/supabase/server</code> (not <code className="rounded bg-white/10 px-1">@/utils/...</code>), <code className="rounded bg-white/10 px-1">force-dynamic</code> + <code className="rounded bg-white/10 px-1">redirect("/login")</code> for auth-only. Anon → 0 rows (correct). Seed via: <code className="rounded bg-white/10 px-1">insert into notes (user_id,title) values ('&lt;your uid&gt;','...')</code></p>
    </div>
  );
}
