# Roadtrip Pomodoro — Production Pomodoro Web

Production-grade Pomodoro web app — Vercel + Supabase + Resend.

- **Live**: https://roadtrip-pomodoro.vercel.app (after Vercel connect) + legacy Pages https://anirudh-2810.github.io/roadtrip-pomodoro/ (legacy/ fallback)
- **Stack**: Next.js 16 App Router + TypeScript + Tailwind 4 + shadcn + Supabase (Auth/Postgres/RLS/pg_cron) + Resend (React Email) + Sentry
- **Features**: Timer (25/5,50/10,15/3+custom), Start/Pause/Resume/Reset, Worker drift-free, progress bar, dashboard (today/7d/30d, streak), auto-email per completed Pomodoro + daily 22:00 IST / weekly digest, signup/login/verify/reset + Google OAuth, **Continue without signup** (guest IndexedDB + claim on signup)
- **Legacy**: Tk legacy/roadtrip.py + single-file web legacy/index.html preserved from tag \pre-next\

## Quick start

``bash
pnpm install
cp .env.example .env.local # set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, AUTH_SECRET
pnpm dev    # http://localhost:3000
pnpm build  # production
pnpm lint
``

## Env

See `.env.example` — never commit `.env.local`. Get keys from Supabase Project Settings + Resend API Keys.

## Deploy

Vercel: import `Anirudh-2810/roadtrip-pomodoro` (Root `/`), add env vars, deploy `main`.

