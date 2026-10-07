-- Shared boat catalog and navigator-controlled race progress. Personal snapshots
-- remain available for one-time import; they are no longer the sharing boundary.
create table public.boat_workspaces (
  id text primary key,
  owner_id uuid not null references auth.users(id),
  navigator_id uuid not null references auth.users(id),
  catalog jsonb not null,
  revision bigint not null default 1
);
create table public.boat_memberships (
  boat_id text not null references public.boat_workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'admin', 'crew')),
  display_name text not null,
  primary key (boat_id, user_id)
);
create table public.boat_race_progress (
  boat_id text not null references public.boat_workspaces(id) on delete cascade,
  race_id text not null,
  session jsonb not null,
  revision bigint not null default 1,
  primary key (boat_id, race_id)
);
create table public.boat_invitations (
  code text primary key,
  boat_id text not null references public.boat_workspaces(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '7 days')
);
alter table public.boat_workspaces enable row level security;
alter table public.boat_memberships enable row level security;
alter table public.boat_race_progress enable row level security;
alter table public.boat_invitations enable row level security;

create function public.boat_member_role(p_boat text) returns text
language sql stable security definer set search_path = '' as $$
  select role from public.boat_memberships where boat_id = p_boat and user_id = auth.uid()
$$;
create policy "members read boat" on public.boat_workspaces for select to authenticated using (public.boat_member_role(id) is not null);
create policy "members read crew" on public.boat_memberships for select to authenticated using (public.boat_member_role(boat_id) is not null);
create policy "members read progress" on public.boat_race_progress for select to authenticated using (public.boat_member_role(boat_id) is not null);

create function public.create_boat_workspace(p_id text, p_catalog jsonb) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or p_catalog->'boat'->>'id' is distinct from p_id or nullif(trim(p_catalog->'boat'->>'name'), '') is null then
    raise exception 'A signed-in user and a named boat are required';
  end if;
  insert into public.boat_workspaces(id, owner_id, navigator_id, catalog) values(p_id, auth.uid(), auth.uid(), p_catalog);
  insert into public.boat_memberships values(p_id, auth.uid(), 'owner', coalesce(auth.jwt()->'user_metadata'->>'full_name', auth.jwt()->>'email', 'Owner'));
end $$;

create function public.save_boat_catalog(p_boat text, p_catalog jsonb, p_revision bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare next_revision bigint; old_catalog jsonb; progress public.boat_race_progress; old_race jsonb; new_race jsonb; target_id text; new_index integer;
begin
  if coalesce(public.boat_member_role(p_boat), '') not in ('owner', 'admin') then raise exception 'Only owners and admins can edit this boat'; end if;
  if p_catalog->'boat'->>'id' is distinct from p_boat or nullif(trim(p_catalog->'boat'->>'name'), '') is null then raise exception 'Invalid boat'; end if;
  select catalog into old_catalog from public.boat_workspaces where id = p_boat for update;
  for progress in select * from public.boat_race_progress where boat_id = p_boat loop
    select value into old_race from jsonb_array_elements(old_catalog->'races') where value->>'id' = progress.race_id;
    select value into new_race from jsonb_array_elements(p_catalog->'races') where value->>'id' = progress.race_id;
    if progress.session->>'phase' = 'finished' and new_race is distinct from old_race then raise exception 'Finished race history is read-only'; end if;
    if progress.session->>'phase' in ('prestart', 'racing') then
      target_id := old_race->'course'->((progress.session->>'activeWaypointIndex')::integer)->>'id';
      select ordinality::integer - 1 into new_index from jsonb_array_elements(new_race->'course') with ordinality where value->>'id' = target_id;
      if new_index is null then raise exception 'Choose another shared target before removing the current waypoint'; end if;
      if new_index <> (progress.session->>'activeWaypointIndex')::integer then
        update public.boat_race_progress set session = jsonb_set(session, '{activeWaypointIndex}', to_jsonb(new_index)), revision = revision + 1 where boat_id = p_boat and race_id = progress.race_id;
      end if;
    end if;
  end loop;
  update public.boat_workspaces set catalog = p_catalog, revision = revision + 1 where id = p_boat and revision = p_revision returning revision into next_revision;
  if next_revision is null then raise exception 'SHARED_CONFLICT: Boat changed on another device'; end if;
  return next_revision;
end $$;

create function public.save_boat_progress(p_boat text, p_race text, p_session jsonb, p_revision bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare workspace public.boat_workspaces; existing public.boat_race_progress; course jsonb; target integer; complete_track jsonb;
begin
  select * into workspace from public.boat_workspaces where id = p_boat for update;
  if workspace.navigator_id is distinct from auth.uid() or public.boat_member_role(p_boat) is null then raise exception 'Only the assigned navigator can change race progress'; end if;
  select value->'course' into course from jsonb_array_elements(workspace.catalog->'races') where value->>'id' = p_race;
  target := (p_session->>'activeWaypointIndex')::integer;
  if course is null or target is null or target < 0 or target >= jsonb_array_length(course)
    or p_session->>'raceId' is distinct from p_race or p_session->>'id' is null
    or coalesce(p_session->>'phase', '') not in ('setup', 'prestart', 'racing', 'finished') then raise exception 'Invalid race progress'; end if;
  select * into existing from public.boat_race_progress where boat_id = p_boat and race_id = p_race;
  if coalesce(existing.revision, 0) <> p_revision then raise exception 'SHARED_CONFLICT: Navigator progress changed on another device'; end if;
  if existing.session->>'phase' = 'finished' and p_session is distinct from existing.session then raise exception 'Finished race history is read-only'; end if;
  if existing.session is not null and existing.session->>'id' is distinct from p_session->>'id' then raise exception 'Race session cannot be replaced'; end if;
  -- A navigator handoff must retain every previously synced fix, even if the
  -- new device has only the recent navigation window or starts recording late.
  select coalesce(jsonb_agg(fix order by (fix->>'timestamp')::bigint), '[]'::jsonb) into complete_track from (
    select distinct on ((value->>'timestamp')::bigint) value as fix
    from jsonb_array_elements(coalesce(existing.session->'telemetry', '[]'::jsonb) || coalesce(p_session->'telemetry', '[]'::jsonb))
    order by (value->>'timestamp')::bigint
  ) fixes;
  p_session := jsonb_set(p_session, '{telemetry}', complete_track);
  insert into public.boat_race_progress values(p_boat, p_race, p_session, p_revision + 1)
    on conflict (boat_id, race_id) do update set session = excluded.session, revision = excluded.revision;
  return p_revision + 1;
end $$;

create function public.create_boat_invitation(p_boat text) returns text
language plpgsql security definer set search_path = '' as $$
declare token text;
begin
  if coalesce(public.boat_member_role(p_boat), '') not in ('owner', 'admin') then raise exception 'Only owners and admins can invite crew'; end if;
  token := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));
  delete from public.boat_invitations where boat_id = p_boat;
  insert into public.boat_invitations(code, boat_id) values(token, p_boat);
  return token;
end $$;

create function public.preview_boat_invitation(p_code text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object('id', w.id, 'name', w.catalog->'boat'->>'name')
    from public.boat_invitations i join public.boat_workspaces w on w.id = i.boat_id
    where auth.uid() is not null and i.code = upper(p_code) and i.expires_at > now()
$$;
create function public.join_boat_workspace(p_code text) returns text
language plpgsql security definer set search_path = '' as $$
declare boat text;
begin
  if auth.uid() is null then raise exception 'Sign in to join this boat'; end if;
  select boat_id into boat from public.boat_invitations where code = upper(p_code) and expires_at > now();
  if boat is null then raise exception 'Invitation is invalid or expired. Ask an admin for a new code.'; end if;
  insert into public.boat_memberships values(boat, auth.uid(), 'crew', coalesce(auth.jwt()->'user_metadata'->>'full_name', auth.jwt()->>'email', 'Crew')) on conflict do nothing;
  return boat;
end $$;

create function public.assign_boat_member(p_boat text, p_user uuid, p_role text default null, p_navigator boolean default false) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if coalesce(public.boat_member_role(p_boat), '') not in ('owner', 'admin') then raise exception 'Only owners and admins can assign crew'; end if;
  perform 1 from public.boat_workspaces where id = p_boat for update;
  if not exists(select 1 from public.boat_memberships where boat_id = p_boat and user_id = p_user) then raise exception 'Select a boat member'; end if;
  if p_role is not null then
    if public.boat_member_role(p_boat) <> 'owner' or p_role not in ('admin', 'crew') then raise exception 'Only the owner can grant admin access'; end if;
    update public.boat_memberships set role = p_role where boat_id = p_boat and user_id = p_user and role <> 'owner';
  end if;
  if p_navigator then update public.boat_workspaces set navigator_id = p_user, revision = revision + 1 where id = p_boat; end if;
end $$;

revoke all on public.boat_workspaces, public.boat_memberships, public.boat_race_progress, public.boat_invitations from anon, authenticated;
grant select on public.boat_workspaces, public.boat_memberships, public.boat_race_progress to authenticated;
revoke all on function public.boat_member_role(text), public.create_boat_workspace(text,jsonb), public.save_boat_catalog(text,jsonb,bigint), public.save_boat_progress(text,text,jsonb,bigint), public.create_boat_invitation(text), public.preview_boat_invitation(text), public.join_boat_workspace(text), public.assign_boat_member(text,uuid,text,boolean) from public;
grant execute on function public.boat_member_role(text), public.create_boat_workspace(text,jsonb), public.save_boat_catalog(text,jsonb,bigint), public.save_boat_progress(text,text,jsonb,bigint), public.create_boat_invitation(text), public.preview_boat_invitation(text), public.join_boat_workspace(text), public.assign_boat_member(text,uuid,text,boolean) to authenticated;
