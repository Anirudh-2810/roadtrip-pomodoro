# Roadtrip Pomodoro — Production Pomodoro Web

An endless-highway focus timer: pick an intent and a route, cruise through a 60fps winding-road canvas with procedural road hum, log trips, and get session + digest emails. Production-grade Next.js + Supabase + Resend on Vercel, with guest mode.

- **Live**: `https://roadtrip-pomodoro.vercel.app`
- **Stack**: Next.js 16 App Router + TypeScript + Tailwind 4 + shadcn + Supabase (Auth / Postgres / RLS / pg_cron) + Resend (React Email)
- **Timer**: 25 / 50 / 90 / 120 presets + custom minutes or `mm:ss` (1–180), Start / Pause / Resume / Reset, drift-free RAF clock, progress bar, km + cruise readout
- **Road experience**: Canvas2D endless road (perspective winding, parallax hills, scrolling dashes + scenery, mini car), Web Audio 4s `brown/pink/white/rain` beds + 55/110 Hz hum, cover overlay, fullscreen HUD, `Space / R / M / F / Esc` shortcuts
- **Breaks**: manual Pull over (2/5/10/15) — car eases onto the shoulder with hazard blink, local countdown + fuel bar, auto-return chime, zero session rows
- **Accounts**: signup / login / verify / reset + Google OAuth, **Continue without signup** (guest IndexedDB + claim on signup), Trip Log (last 50, per-row delete, markdown export), dashboard (today / 7d / 30d, streak), auto-email per completed Pomodoro + daily 22:00 IST / weekly digest
- **Legacy**: Tk `legacy/roadtrip.py` + single-file web `legacy/index.html` preserved from tag `pre-next`

## Routes

| Route | Minutes | Use |
|-------|---------|-----|
| Coastal Hop | 25 | Quick sprint — Pomodoro replacement |
| Desert Stretch | 50 | Deep work block — one chapter / problem set |
| Mountain Pass | 90 | Long haul — essay draft / feature + tests |
| Cross-Country | 120 | Marathon — half-day build |
| Custom | 1–180 | Minutes or `mm:ss` (e.g. `1`, `1:30`) |

## Quick start

```bash
pnpm install
cp .env.example .env.local # set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY, AUTH_SECRET
pnpm dev    # http://localhost:3000
pnpm build  # production
pnpm lint
```

## Env

See `.env.example` — never commit `.env.local`. Get keys from Supabase Project Settings + Resend API Keys.

## Health

`GET /api/health` reports `supabase` / `email` / `redis` config status. Use it to verify env before debugging signup or email flows.

## Structure

- `src/components/roadtrip/RoadtripCanvas.tsx` — pure Canvas2D winding road (no WebGL dep)
- `src/components/roadtrip/RoadtripExperience.tsx` — timer state, RAF loop, cover, HUD, sheet, Trip Log
- `src/lib/audio-roadtrip.ts` — 4s Web Audio noise beds + hum
- `src/lib/guest.ts` — guest session cache + claim
- `supabase/migrations/001_init.sql` — tables + RLS
- `legacy/` — Tk + single-file web preserved

## Deploy

Vercel: import the repo (Framework: Next.js, Root Directory `/`), add env vars, deploy `main`.
