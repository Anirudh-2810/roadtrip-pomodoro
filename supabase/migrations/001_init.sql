-- 001_init — Roadtrip Pomodoro production schema
-- Run in Supabase SQL Editor or `supabase db push`

-- sessions: each pomodoro
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_sec int not null check (duration_sec between 1 and 10800),
  preset text not null check (char_length(preset) between 1 and 20),
  intent text check (char_length(intent) <= 200),
  completed boolean not null default true,
  route text,
  created_at timestamptz not null default now()
);
create index if not exists sessions_user_started_idx on public.sessions(user_id, started_at desc);
alter table public.sessions enable row level security;
drop policy if exists "owner read" on public.sessions;
create policy "owner read" on public.sessions for select using (auth.uid() = user_id);
drop policy if exists "owner insert" on public.sessions;
create policy "owner insert" on public.sessions for insert with check (auth.uid() = user_id);
drop policy if exists "owner delete" on public.sessions;
create policy "owner delete" on public.sessions for delete using (auth.uid() = user_id);

-- email_preferences: per-user digest toggle
create table if not exists public.email_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  daily_enabled boolean not null default true,
  daily_time time not null default '22:00',
  weekly_enabled boolean not null default true,
  weekly_dow int not null default 0 check (weekly_dow between 0 and 6),
  timezone text not null default 'Asia/Kolkata',
  updated_at timestamptz not null default now()
);
alter table public.email_preferences enable row level security;
drop policy if exists "prefs owner all" on public.email_preferences;
create policy "prefs owner all" on public.email_preferences for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- email_logs: audit each send
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('session','daily','weekly','share','export')),
  to_email text not null,
  session_id uuid references public.sessions(id) on delete set null,
  status text not null default 'sent',
  provider_msg_id text,
  created_at timestamptz not null default now()
);
create index if not exists email_logs_user_idx on public.email_logs(user_id, created_at desc);
alter table public.email_logs enable row level security;
drop policy if exists "logs owner read" on public.email_logs;
create policy "logs owner read" on public.email_logs for select using (auth.uid() = user_id);
drop policy if exists "logs owner insert" on public.email_logs;
create policy "logs owner insert" on public.email_logs for insert with check (auth.uid() = user_id);

-- pg_cron for digest (requires pg_cron extension — enable in Supabase Dashboard → Database → Extensions)
-- Example cron (run after setting SUPABASE_SERVICE_ROLE_KEY in vault):
-- select cron.schedule('daily-digest-22ist', '30 16 * * *', $$ select net.http_post(url:='https://YOUR_PROJECT.supabase.co/functions/v1/send-digest', headers:='{"Authorization":"Bearer '|| current_setting('app.service_key') || '"}'::jsonb, body:='{"period":"daily"}'::jsonb) $$);
-- select cron.schedule('weekly-digest-sun09ist', '30 3 * * 0', $$ select net.http_post(url:='https://YOUR_PROJECT.supabase.co/functions/v1/send-digest', headers:='{"Authorization":"Bearer '|| current_setting('app.service_key') || '"}'::jsonb, body:='{"period":"weekly"}'::jsonb) $$);
