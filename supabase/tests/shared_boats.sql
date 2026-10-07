-- Run against a disposable PostgreSQL instance after the shared boat migration.
-- Auth test doubles must be installed by the runner, never in production.
begin;
insert into auth.users(id) values ('11111111-1111-1111-1111-111111111111'), ('22222222-2222-2222-2222-222222222222'), ('33333333-3333-3333-3333-333333333333');
set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.create_boat_workspace('boat-test', '{"boat":{"id":"boat-test","name":"Saltwater"},"races":[{"id":"race-test","course":[{"id":"start","role":"start"},{"id":"mark","role":"mark"},{"id":"finish","role":"finish"}]}],"marks":[],"sails":[],"crew":[]}');
select public.create_boat_invitation('boat-test') as invite_code \gset
select public.save_boat_progress('boat-test','race-test','{"id":"session-test","raceId":"race-test","phase":"racing","activeWaypointIndex":1,"syncedStartTime":1000,"telemetry":[{"timestamp":1000,"latitude":-33.8,"longitude":151.2}],"roundedAt":{}}',0);
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
do $$ begin
  if exists(select 1 from public.boat_workspaces) then raise exception 'Non-member could read boat'; end if;
end $$;
select public.join_boat_workspace(:'invite_code');
select public.join_boat_workspace(:'invite_code'); -- Idempotent acceptance must preserve role.
do $$ begin
  if (select count(*) from public.boat_workspaces) <> 1 then raise exception 'Crew cannot read boat'; end if;
  if (select session->>'activeWaypointIndex' from public.boat_race_progress) <> '1' then raise exception 'Crew missed shared target'; end if;
  begin
    perform public.save_boat_progress('boat-test','race-test','{"id":"session-test","raceId":"race-test","phase":"racing","activeWaypointIndex":2}',1);
    raise exception 'Crew changed navigation';
  exception when raise_exception then if sqlerrm not like 'Only the assigned navigator%' then raise; end if; end;
  begin
    perform public.create_boat_invitation('boat-test'); raise exception 'Crew created invitation';
  exception when raise_exception then if sqlerrm not like 'Only owners and admins%' then raise; end if; end;
  begin
    perform public.save_boat_catalog('boat-test','{}',1); raise exception 'Crew edited catalog';
  exception when raise_exception then if sqlerrm not like 'Only owners and admins%' then raise; end if; end;
  begin
    update public.boat_workspaces set navigator_id = auth.uid(); raise exception 'Direct write bypassed permissions';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
select public.assign_boat_member('boat-test','22222222-2222-2222-2222-222222222222',null,true);
do $$ begin
  begin
    perform public.save_boat_progress('boat-test','race-test','{"id":"session-test","raceId":"race-test","phase":"racing","activeWaypointIndex":2}',1);
    raise exception 'Old navigator wrote after handoff';
  exception when raise_exception then if sqlerrm not like 'Only the assigned navigator%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
select public.save_boat_progress('boat-test','race-test','{"id":"session-test","raceId":"race-test","phase":"racing","activeWaypointIndex":2,"telemetry":[{"timestamp":2000,"latitude":-33.9,"longitude":151.2}]}',1);
do $$ begin
  if (select jsonb_array_length(session->'telemetry') from public.boat_race_progress) <> 2 then raise exception 'Navigator handoff lost earlier fixes'; end if;
  begin
    perform public.save_boat_progress('boat-test','race-test','{"id":"session-test","raceId":"race-test","phase":"racing","activeWaypointIndex":0}',1);
    raise exception 'Stale offline update was accepted';
  exception when raise_exception then if sqlerrm not like 'SHARED_CONFLICT:%' then raise; end if; end;
end $$;
select public.save_boat_progress('boat-test','race-test','{"id":"session-test","raceId":"race-test","phase":"finished","activeWaypointIndex":2}',2);
do $$ begin
  begin
    perform public.save_boat_progress('boat-test','race-test','{"id":"session-test","raceId":"race-test","phase":"racing","activeWaypointIndex":0}',3);
    raise exception 'Finished history could be reset';
  exception when raise_exception then if sqlerrm not like 'Finished race history%' then raise; end if; end;
end $$;
select set_config('request.jwt.claim.sub', '33333333-3333-3333-3333-333333333333', true);
do $$ begin
  if exists(select 1 from public.boat_race_progress) then raise exception 'Outsider read shared race'; end if;
  if exists(select 1 from public.boat_memberships) then raise exception 'Outsider read crew'; end if;
end $$;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
do $$ begin
  begin
    perform public.save_boat_catalog('boat-test','{"boat":{"id":"boat-test","name":"Saltwater"},"races":[]}',2);
    raise exception 'Finished race could be removed from catalog';
  exception when raise_exception then if sqlerrm not like 'Finished race history%' then raise; end if; end;
end $$;
rollback;
