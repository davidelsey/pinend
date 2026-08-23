create extension if not exists postgis with schema extensions;

create type public.mark_position_kind as enum ('fixed', 'variable', 'constructed');
create type public.bearing_reference as enum ('true', 'magnetic');
create type public.race_phase as enum ('setup', 'prestart', 'racing', 'finished');
create type public.sail_location as enum ('rigged', 'wardrobe', 'locker');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.clubs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  address text,
  website text,
  location extensions.geography(point, 4326),
  created_by uuid not null references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.series (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references public.clubs(id) on delete cascade,
  name text not null,
  season text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.races (
  id uuid primary key default gen_random_uuid(),
  series_id uuid not null references public.series(id) on delete cascade,
  name text not null,
  scheduled_start timestamptz not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.fleets (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  name text not null,
  scheduled_start timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.marks (
  id uuid primary key default gen_random_uuid(),
  club_id uuid references public.clubs(id) on delete cascade,
  name text not null,
  short_name text not null,
  position_kind public.mark_position_kind not null,
  coordinate extensions.geography(point, 4326),
  origin extensions.geography(point, 4326),
  distance_nm numeric(8, 3),
  bearing_degrees numeric(6, 2),
  bearing_reference public.bearing_reference,
  declination_degrees numeric(5, 2),
  notes text,
  created_by uuid not null references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint valid_mark_geometry check (
    (position_kind = 'fixed' and coordinate is not null) or
    (position_kind = 'variable') or
    (position_kind = 'constructed' and origin is not null and distance_nm is not null and bearing_degrees is not null and bearing_reference is not null)
  )
);

create table public.boats (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  sail_number text,
  design text,
  length_metres numeric(7, 2),
  draft_metres numeric(6, 2),
  particulars jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.sails (
  id uuid primary key default gen_random_uuid(),
  boat_id uuid not null references public.boats(id) on delete cascade,
  name text not null,
  sail_type text not null,
  condition text not null,
  location public.sail_location not null default 'locker',
  notes text,
  particulars jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  race_id uuid not null references public.races(id) on delete cascade,
  fleet_id uuid references public.fleets(id) on delete cascade,
  name text not null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.course_waypoints (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  mark_id uuid not null references public.marks(id),
  sequence integer not null check (sequence >= 0),
  rounding text not null check (rounding in ('port', 'starboard', 'either')),
  unique (course_id, sequence)
);

create table public.race_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  race_id uuid not null references public.races(id),
  fleet_id uuid references public.fleets(id),
  boat_id uuid not null references public.boats(id),
  phase public.race_phase not null default 'setup',
  synced_start_time timestamptz not null,
  active_waypoint_index integer not null default 0,
  selected_sail_ids uuid[] not null default '{}',
  rounded_at jsonb not null default '{}'::jsonb,
  summary jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, race_id, boat_id)
);

create table public.line_observations (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.race_sessions(id) on delete cascade,
  endpoint text not null check (endpoint in ('pin', 'committee', 'mark')),
  mark_id uuid references public.marks(id) on delete cascade,
  observer extensions.geography(point, 4326) not null,
  bearing_true numeric(6, 2) not null,
  accuracy_metres numeric(8, 2) not null,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((endpoint = 'mark' and mark_id is not null) or (endpoint <> 'mark' and mark_id is null))
);

create index clubs_location_index on public.clubs using gist(location);
create index marks_coordinate_index on public.marks using gist(coordinate);
create index races_series_index on public.races(series_id);
create index sessions_user_index on public.race_sessions(user_id, updated_at desc);

alter table public.profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.series enable row level security;
alter table public.races enable row level security;
alter table public.fleets enable row level security;
alter table public.marks enable row level security;
alter table public.boats enable row level security;
alter table public.sails enable row level security;
alter table public.courses enable row level security;
alter table public.course_waypoints enable row level security;
alter table public.race_sessions enable row level security;
alter table public.line_observations enable row level security;

create policy "profiles are readable by signed-in users" on public.profiles for select to authenticated using (true);
create policy "users update their profile" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "community clubs are readable" on public.clubs for select to authenticated using (true);
create policy "users create clubs" on public.clubs for insert to authenticated with check (created_by = auth.uid());
create policy "creators update clubs" on public.clubs for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "community series are readable" on public.series for select to authenticated using (true);
create policy "users create series" on public.series for insert to authenticated with check (created_by = auth.uid());
create policy "creators update series" on public.series for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "community races are readable" on public.races for select to authenticated using (true);
create policy "users create races" on public.races for insert to authenticated with check (created_by = auth.uid());
create policy "creators update races" on public.races for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "community fleets are readable" on public.fleets for select to authenticated using (true);
create policy "users create fleets" on public.fleets for insert to authenticated with check (created_by = auth.uid());
create policy "creators update fleets" on public.fleets for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "community marks are readable" on public.marks for select to authenticated using (true);
create policy "users create marks" on public.marks for insert to authenticated with check (created_by = auth.uid());
create policy "creators update marks" on public.marks for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

create policy "owners manage boats" on public.boats for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owners manage sails" on public.sails for all to authenticated
  using (exists (select 1 from public.boats where boats.id = sails.boat_id and boats.owner_id = auth.uid()))
  with check (exists (select 1 from public.boats where boats.id = sails.boat_id and boats.owner_id = auth.uid()));

create policy "community courses are readable" on public.courses for select to authenticated using (true);
create policy "users create courses" on public.courses for insert to authenticated with check (created_by = auth.uid());
create policy "creators update courses" on public.courses for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());
create policy "community waypoints are readable" on public.course_waypoints for select to authenticated using (true);
create policy "course creators manage waypoints" on public.course_waypoints for all to authenticated
  using (exists (select 1 from public.courses where courses.id = course_waypoints.course_id and courses.created_by = auth.uid()))
  with check (exists (select 1 from public.courses where courses.id = course_waypoints.course_id and courses.created_by = auth.uid()));

create policy "users manage race sessions" on public.race_sessions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "users manage their observations" on public.line_observations for all to authenticated
  using (exists (select 1 from public.race_sessions where race_sessions.id = line_observations.session_id and race_sessions.user_id = auth.uid()))
  with check (exists (select 1 from public.race_sessions where race_sessions.id = line_observations.session_id and race_sessions.user_id = auth.uid()));

create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'avatar_url');
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
