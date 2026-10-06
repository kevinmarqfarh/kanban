-- Run in the SQL editor for project rucwlpzrumxejvhwazat.
-- This schema has not been applied automatically: the connected account cannot access that project.
begin;

create table public.kanban_workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  revision integer not null default 1 check (revision > 0),
  updated_at timestamptz not null default now(),
  constraint kanban_workspace_shape check (
    jsonb_typeof(data) = 'object'
    and data ?& array['columns', 'tasks', 'projects']
    and jsonb_typeof(data -> 'columns') = 'array'
    and jsonb_typeof(data -> 'tasks') = 'array'
    and jsonb_typeof(data -> 'projects') = 'array'
  )
);

alter table public.kanban_workspaces enable row level security;
revoke all on table public.kanban_workspaces from public, anon, authenticated;
grant select, insert, update on table public.kanban_workspaces to authenticated;

create policy "Owners read their workspace"
  on public.kanban_workspaces for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "Owners create their workspace"
  on public.kanban_workspaces for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Owners update their workspace"
  on public.kanban_workspaces for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Clients update with `where user_id = auth.uid() and revision = last_seen_revision`.
-- The server owns the next revision, preventing accidental stale overwrites.
create function public.advance_kanban_revision()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function public.advance_kanban_revision() from public, anon, authenticated;

create trigger advance_kanban_revision
  before update on public.kanban_workspaces
  for each row execute function public.advance_kanban_revision();

commit;
