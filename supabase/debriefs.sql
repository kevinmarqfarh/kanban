-- Prepared for rucwlpzrumxejvhwazat; not applied or live-verified.
-- Inspect any existing daily_debriefs table before running this file.
-- Debriefs are separate from kanban_workspaces; automation must never overwrite its JSON.
begin;

create table public.daily_debriefs (
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null check (date between date '0001-01-01' and date '9999-12-31'),
  title text not null check (char_length(title) <= 120 and char_length(btrim(title)) > 0),
  summary text not null default '' check (char_length(summary) <= 500),
  body text not null check (char_length(body) <= 20000 and char_length(btrim(body)) > 0),
  created_at timestamptz not null default now() check (isfinite(created_at)),
  read_at timestamptz check (read_at is null or isfinite(read_at)),
  dismissed_at timestamptz check (dismissed_at is null or isfinite(dismissed_at)),
  primary key (user_id, date)
);

alter table public.daily_debriefs enable row level security;

-- Explicit grants also support projects with automatic API exposure disabled.
-- Revoking table-level UPDATE is essential before granting selected columns.
revoke all on table public.daily_debriefs from public, anon, authenticated, service_role;
grant select, insert on table public.daily_debriefs to authenticated;
grant update (read_at, dismissed_at) on table public.daily_debriefs to authenticated;
grant select, insert, update on table public.daily_debriefs to service_role;

create policy "Owners read their daily debriefs"
  on public.daily_debriefs for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners import their daily debriefs"
  on public.daily_debriefs for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Owners update debrief read state"
  on public.daily_debriefs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- The service_role bypasses RLS. Its key belongs only in a trusted server job.
-- Client imports use INSERT: duplicates return 23505 instead of replacing content.
-- No DELETE privilege is granted; dismissing retains the debrief in history.
commit;
