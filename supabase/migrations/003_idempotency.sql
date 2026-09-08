-- 003_idempotency — one row per user trip + owner update
-- Backstop against double-finish POSTs and re-claimed guest rows.

-- Idempotency key: (user_id, started_at). started_at is ISO ms-precision
-- set once per run, so a retried/double-fired POST collapses to one row.
create unique index if not exists sessions_user_started_uidx
  on public.sessions(user_id, started_at);

-- 001_init.sql shipped select/insert/delete only; updates (e.g. intent
-- corrections) would 403. Add the missing owner-update policy.
alter table public.sessions enable row level security;
drop policy if exists "owner update" on public.sessions;
create policy "owner update" on public.sessions
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
