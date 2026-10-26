-- A confirmed return to pre-start clears roundings and track, preserving the
-- session ID so sightings remain attached. The cutoff also excludes old fixes
-- arriving after an offline period or navigator handoff.
create or replace function public.save_boat_progress(p_boat text, p_race text, p_session jsonb, p_revision bigint) returns bigint
language plpgsql security definer set search_path = '' as $$
declare
  workspace public.boat_workspaces;
  existing public.boat_race_progress;
  course jsonb;
  target integer;
  complete_track jsonb;
  reset_at bigint;
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
  reset_at := coalesce((p_session->>'trackResetAt')::bigint, 0);
  if reset_at < coalesce((existing.session->>'trackResetAt')::bigint, 0) then raise exception 'SHARED_CONFLICT: Race track was reset on another device'; end if;
  if reset_at < 0 then raise exception 'Invalid race progress'; end if;
  select coalesce(jsonb_agg(fix order by (fix->>'timestamp')::bigint), '[]'::jsonb) into complete_track from (
    select distinct on ((value->>'timestamp')::bigint) value as fix
    from jsonb_array_elements(coalesce(existing.session->'telemetry', '[]'::jsonb) || coalesce(p_session->'telemetry', '[]'::jsonb))
    where (value->>'timestamp')::bigint > reset_at
    order by (value->>'timestamp')::bigint
  ) fixes;
  p_session := jsonb_set(p_session, '{telemetry}', complete_track);
  insert into public.boat_race_progress values(p_boat, p_race, p_session, p_revision + 1)
    on conflict (boat_id, race_id) do update set session = excluded.session, revision = excluded.revision;
  return p_revision + 1;
end $$;
