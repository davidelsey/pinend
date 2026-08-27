create table public.user_app_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  schema_version integer not null default 1,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_app_state enable row level security;

create policy "users manage their app state"
  on public.user_app_state
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
