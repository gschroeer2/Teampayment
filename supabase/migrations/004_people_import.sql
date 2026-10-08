begin;
-- A personnel category describes team duties; it never changes memberships/auth roles.
alter table public.players add column category text not null default 'player' check(category in ('player','coach','staff'));
alter table public.players add column first_name text check(first_name is null or length(btrim(first_name)) between 1 and 80);
alter table public.players add column last_name text check(last_name is null or length(btrim(last_name)) between 1 and 80);
alter table public.import_batches drop constraint import_batches_source_check;
alter table public.import_batches add constraint import_batches_source_check check(source in ('bank','paypal','whatsapp','catalog','drinks','people'));
-- Keep prior catalogue, WhatsApp and financial RPCs private and inaccessible directly.
alter function public.teamkasse_command(uuid,jsonb) set schema private;
alter function private.teamkasse_command(uuid,jsonb) rename to teamkasse_command_v3;
revoke all on function private.teamkasse_command_v3(uuid,jsonb) from public,anon,authenticated;
create function public.teamkasse_command(p_team uuid,p_command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare cmd text:=p_command->>'type'; r jsonb; pid uuid; fullname text; first text; last text; cat text; key text; seen text[]:='{}'; next_code integer; previous public.players;
begin
 if not private.is_manager(p_team) then raise exception 'Forbidden' using errcode='42501'; end if;
 -- Serializes name lookup and generated MK IDs, including simultaneous imports.
 perform 1 from public.teams where id=p_team for update;
 if cmd='importPeople' then
  if coalesce(p_command->>'fileHash','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid file hash'; end if;
  if jsonb_typeof(p_command->'rows') is distinct from 'array' then raise exception 'Rows required'; end if;
  if jsonb_array_length(p_command->'rows') not between 1 and 200 then raise exception 'Row limit'; end if;
  insert into public.import_batches(team_id,source,file_hash,status,row_count,created_by) values(p_team,'people',p_command->>'fileHash','reviewed',jsonb_array_length(p_command->'rows'),auth.uid());
  select coalesce(max(substring(code from 4)::integer),0)+1 into next_code from public.players where team_id=p_team;
  for r in select value from jsonb_array_elements(p_command->'rows') loop
   first:=btrim(r->>'firstName'); last:=btrim(r->>'lastName'); cat:=r->>'category'; fullname:=first||' '||last;
   if first is null or last is null or length(first) not between 1 and 80 or length(last) not between 1 and 80 or length(fullname)>100 or cat is null or cat not in ('player','coach','staff') then raise exception 'Invalid person row'; end if;
   key:=lower(regexp_replace(btrim(fullname),'[[:space:]]+',' ','g'));
   if key=any(seen) then raise exception 'Duplicate people rows'; end if;
   seen:=array_append(seen,key);
   if r ? 'id' then
    pid:=(r->>'id')::uuid;
    select * into previous from public.players where id=pid and team_id=p_team;
    if not found or lower(regexp_replace(btrim(previous.name),'[[:space:]]+',' ','g'))<>key then raise exception 'Person mismatch'; end if;
    -- Preserve name, ID, aliases, active state and all attached financial records.
    update public.players set first_name=first,last_name=last,category=cat where id=pid and team_id=p_team;
   else
    if exists(select 1 from public.players where team_id=p_team and lower(regexp_replace(btrim(name),'[[:space:]]+',' ','g'))=key) then raise exception 'Person exists; explicit ID required'; end if;
    if next_code>999999 then raise exception 'No available MK code'; end if;
    insert into public.players(team_id,name,first_name,last_name,category,code,aliases,active) values(p_team,fullname,first,last,cat,'MK-'||lpad(next_code::text,greatest(3,length(next_code::text)),'0'),'{}',true);
    next_code:=next_code+1;
   end if;
  end loop;
 elsif cmd='savePlayer' then
  cat:=p_command->>'category';
  if cat is not null and cat not in ('player','coach','staff') then raise exception 'Invalid category'; end if;
  if p_command ? 'id' then
   pid:=(p_command->>'id')::uuid;
   select * into previous from public.players where id=pid and team_id=p_team;
   if not found then raise exception 'Player not found'; end if;
   update public.players set name=p_command->>'name',code=upper(p_command->>'code'),aliases=array(select jsonb_array_elements_text(p_command->'aliases')),active=(p_command->>'active')::boolean,category=coalesce(cat,category),first_name=case when name=p_command->>'name' then first_name else null end,last_name=case when name=p_command->>'name' then last_name else null end where id=pid and team_id=p_team;
  else
   insert into public.players(team_id,name,code,aliases,active,category) values(p_team,p_command->>'name',upper(p_command->>'code'),array(select jsonb_array_elements_text(p_command->'aliases')),(p_command->>'active')::boolean,coalesce(cat,'player'));
  end if;
 elsif cmd='anonymizePlayer' then
  if private.role_for(p_team)<>'admin' then raise exception 'Admin required' using errcode='42501'; end if;
  -- Redact added fields first; the older implementation then clears audit snapshots.
  update public.players set first_name=null,last_name=null where team_id=p_team and id=(p_command->>'playerId')::uuid;
  perform private.teamkasse_command_v3(p_team,p_command);
 else
  perform private.teamkasse_command_v3(p_team,p_command);
 end if;
end $$;
revoke all on function public.teamkasse_command(uuid,jsonb) from public,anon;
grant execute on function public.teamkasse_command(uuid,jsonb) to authenticated;
notify pgrst,'reload schema';
commit;
