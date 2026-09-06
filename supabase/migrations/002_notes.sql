-- 002_notes — auth-only notes probe (guide 1 adapted)
-- Run in Supabase SQL Editor or `supabase db push`
-- Pattern mirrors 001_init.sql: enable RLS + auth.uid()=user_id owner-only

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 200),
  created_at timestamptz not null default now()
);
create index if not exists notes_user_created_idx on public.notes(user_id, created_at desc);
alter table public.notes enable row level security;
drop policy if exists "notes owner read" on public.notes;
create policy "notes owner read" on public.notes for select using (auth.uid() = user_id);
drop policy if exists "notes owner insert" on public.notes;
create policy "notes owner insert" on public.notes for insert with check (auth.uid() = user_id);
drop policy if exists "notes owner delete" on public.notes;
create policy "notes owner delete" on public.notes for delete using (auth.uid() = user_id);

-- seed for vkanirudh28@gmail.com after first login (replace <uid>):
-- insert into public.notes (user_id,title) values ('<uid>','Today I created a Supabase project.'),('<uid>','I added some data and queried it from Next.js.'),('<uid>','It was awesome!');
