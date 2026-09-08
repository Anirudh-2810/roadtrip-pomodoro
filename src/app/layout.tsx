import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

function getBaseUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (raw) {
    try {
      return new URL(raw);
    } catch {
      // fall through to localhost if env is malformed (e.g. empty or invalid)
    }
  }
  return new URL("http://localhost:3000");
}

export const metadata: Metadata = {
  title: "Roadtrip Pomodoro — Focus timer with email",
  description: "Production Pomodoro timer — Vercel + Supabase + Resend. Auto-email per session + daily/weekly digest. Continue without signup.",
  metadataBase: getBaseUrl(),
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let user: { email?: string | null } | null = null;
  try {
    const { getUser } = await import("@/lib/supabase/server");
    user = await getUser();
  } catch {}
  const email = user?.email ?? null;
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-[#09090B] text-white">
        <header className="sticky top-0 z-30 border-b border-white/10 bg-[#09090B]/80 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 flex h-14 items-center justify-between">
            <a href="/" className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-black text-[11px] font-bold">◐</span>
              <span className="text-sm font-semibold tracking-tight">Roadtrip Pomodoro</span>
            </a>
            <nav className="flex items-center gap-1">
              <a href="/dashboard" className="rounded-full px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-white">
                Dashboard
              </a>
              <a href="/settings" className="rounded-full px-3 py-1.5 text-xs text-zinc-400 hover:bg-white/10 hover:text-white">
                Settings
              </a>
              {email ? (
                <>
                  <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> {email}
                  </span>
                  <span className="sm:hidden rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">● signed in</span>
                  <form action="/api/auth/logout" method="post" className="inline">
                    <button type="submit" className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black hover:bg-zinc-200">
                      Log out
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <a href="/login" className="rounded-full bg-white px-4 py-1.5 text-xs font-medium text-black hover:bg-zinc-200">
                    Log in
                  </a>
                  <a href="/signup" className="rounded-full border border-white/10 px-4 py-1.5 text-xs font-medium text-white hover:bg-white/10">
                    Sign up
                  </a>
                </>
              )}
            </nav>
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-white/10 py-6 text-center text-[11px] text-zinc-600">
          © {new Date().getFullYear()} Roadtrip Pomodoro · <a href="/legacy/index.html" className="hover:text-zinc-400">Legacy</a> · <a href="https://github.com/Anirudh-2810/roadtrip-pomodoro" className="hover:text-zinc-400">GitHub</a>
        </footer>
      </body>
    </html>
  );
}
