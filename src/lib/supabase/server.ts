import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) throw new Error("Missing Supabase env — set NEXT_PUBLIC_SUPABASE_URL/ANON_KEY");
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: Record<string, unknown> }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }: { name: string; value: string; options: Record<string, unknown> }) =>
            cookieStore.set(name, value, { ...options, httpOnly: true, secure: true, sameSite: "lax", path: "/" } as never)
          );
        } catch {
          // ignore in Server Component (read-only)
        }
      },
    },
  });
}

// Service-role client — server-only, never import in client components
export async function createServiceClient() {
  // dynamic import to avoid bundling in client
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !service) throw new Error("Missing service role env");
  const { createClient: createJs } = await import("@supabase/supabase-js");
  return createJs(url, service, { auth: { persistSession: false } });
}

export async function getUser() {
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    return data.user ?? null;
  } catch {
    return null;
  }
}
