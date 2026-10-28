-- Created by `supabase migration new forma_push_device_quota` as 20261028134213.
-- Explicit ordering repair: renamed to follow the existing 20261028193000
-- migration, so a fresh replay creates subscriptions before this trigger.
begin;

create function public.enforce_forma_push_device_quota()
returns trigger
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  -- BEFORE triggers run before RLS WITH CHECK. Reject forged owners before
  -- acquiring their lock, so clients cannot block another account's devices.
  if current_user in ('anon', 'authenticated')
    and (select auth.uid()) is distinct from new.user_id then
    raise exception 'Push subscription owner must match the authenticated user'
      using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.user_id is not distinct from old.user_id then
    return new;
  end if;

  -- A fixed transaction snapshot could miss an insert committed while waiting
  -- for the lock. Registration must use fresh READ COMMITTED snapshots.
  if pg_catalog.current_setting('transaction_isolation') not in ('read committed', 'read uncommitted') then
    raise exception 'Push registration requires READ COMMITTED isolation'
      using errcode = '25000';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('forma_push_device_quota:' || new.user_id::text, 0)
  );

  -- INSERT ... ON CONFLICT(endpoint) DO UPDATE also fires BEFORE INSERT.
  -- Re-registering an owned endpoint consumes no new slot, including at quota.
  if tg_op = 'INSERT' and exists (
    select 1 from public.forma_push_subscriptions
    where user_id = new.user_id and endpoint = new.endpoint
  ) then
    return new;
  end if;

  if (select count(*) from public.forma_push_subscriptions where user_id = new.user_id) >= 10 then
    raise exception 'An account can register at most 10 push devices'
      using errcode = '23514', constraint = 'forma_push_device_quota';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_forma_push_device_quota() from public, anon, authenticated;

-- Also cover privileged owner transfers; ordinary preference edits need no lock.
create trigger enforce_forma_push_device_quota
  before insert or update of user_id on public.forma_push_subscriptions
  for each row execute function public.enforce_forma_push_device_quota();

commit;
