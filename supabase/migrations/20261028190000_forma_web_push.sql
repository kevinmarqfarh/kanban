-- Web Push subscriptions and an internal sender token. The VAPID key pair is generated
-- once by the Edge Function and never exposed through the Data API.
create table public.forma_push_config (
  id boolean primary key default true check (id),
  cron_token text not null default encode(extensions.gen_random_bytes(32), 'hex'),
  vapid_public text,
  vapid_private text,
  created_at timestamptz not null default now()
);
insert into public.forma_push_config (id) values (true);
alter table public.forma_push_config enable row level security;
revoke all on public.forma_push_config from public, anon, authenticated;
grant select, update on public.forma_push_config to service_role;

create table public.forma_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check (length(endpoint) between 10 and 2048),
  p256dh text not null,
  auth_key text not null,
  enabled boolean not null default true,
  tasks boolean not null default true,
  schedule boolean not null default true,
  birthdays boolean not null default true,
  lead_minutes integer not null default 15 check (lead_minutes in (0, 5, 15, 60)),
  quiet_start time,
  quiet_end time,
  time_zone text not null default 'Europe/Stockholm' check (length(time_zone) <= 80),
  updated_at timestamptz not null default now()
);
create index forma_push_subscriptions_user on public.forma_push_subscriptions(user_id);
alter table public.forma_push_subscriptions enable row level security;
revoke all on public.forma_push_subscriptions from public, anon, authenticated;
grant select, insert, update, delete on public.forma_push_subscriptions to authenticated;
grant all on public.forma_push_subscriptions to service_role;
create policy "Owner reads push device" on public.forma_push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "Owner adds push device" on public.forma_push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Owner edits push device" on public.forma_push_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Owner removes push device" on public.forma_push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);

create table public.forma_push_deliveries (
  subscription_id uuid not null references public.forma_push_subscriptions(id) on delete cascade,
  event_key text not null,
  claimed_at timestamptz not null default now(),
  delivered_at timestamptz,
  primary key (subscription_id, event_key)
);
alter table public.forma_push_deliveries enable row level security;
revoke all on public.forma_push_deliveries from public, anon, authenticated;
grant all on public.forma_push_deliveries to service_role;
create index forma_push_deliveries_claimed on public.forma_push_deliveries(claimed_at);
