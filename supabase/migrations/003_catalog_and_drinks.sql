begin;
create unique index penalty_types_name_unique on public.penalty_types(team_id,lower(btrim(name)));
alter table public.import_batches drop constraint import_batches_source_check;
alter table public.import_batches add constraint import_batches_source_check check(source in ('bank','paypal','whatsapp','catalog','drinks'));
alter table public.penalties drop constraint penalties_source_check;
alter table public.penalties add constraint penalties_source_check check(source in ('manual','whatsapp','drinks'));
create table public.drink_consumptions (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id), player_id uuid not null,
 date date not null, list_key text not null check(length(list_key) between 2 and 100 and list_key=lower(btrim(list_key))),
 count integer not null check(count between 1 and 500), unit_price_cents integer not null check(unit_price_cents between 1 and 100000),
 penalty_id uuid not null unique, image_hash text check(image_hash ~ '^[a-f0-9]{64}$'), created_at timestamptz not null default now(),
 foreign key(team_id,player_id) references public.players(team_id,id),
 foreign key(team_id,penalty_id,player_id) references public.penalties(team_id,id,player_id),
 unique(team_id,list_key,player_id,date), unique(team_id,image_hash,player_id,date)
);
alter table public.drink_consumptions enable row level security;
revoke all on public.drink_consumptions from public,anon,authenticated;
grant select on public.drink_consumptions to authenticated;
create policy drinks_read on public.drink_consumptions for select to authenticated using(private.is_manager(team_id) or private.owns_player(team_id,player_id));
create trigger audit_drinks after insert or update or delete on public.drink_consumptions for each row execute function private.audit_change();
-- Preserve the tested ledger operations behind a non-callable private implementation.
alter function public.teamkasse_command(uuid,jsonb) set schema private;
alter function private.teamkasse_command(uuid,jsonb) rename to teamkasse_command_v2;
revoke all on function private.teamkasse_command_v2(uuid,jsonb) from public,anon,authenticated;
create function public.teamkasse_command(p_team uuid,p_command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare cmd text:=p_command->>'type'; r jsonb; cat uuid; player uuid; penalty uuid; price integer; qty integer; stamp date; list text; image text; batch uuid; p record;
begin
 if not private.is_manager(p_team) then raise exception 'Forbidden' using errcode='42501'; end if;
 perform 1 from public.teams where id=p_team for update;
 if cmd='importPenaltyCatalog' then
  if private.role_for(p_team)<>'admin' then raise exception 'Admin required' using errcode='42501'; end if;
  if coalesce(p_command->>'fileHash','') !~ '^[a-f0-9]{64}$' then raise exception 'Invalid file hash'; end if;
  if jsonb_typeof(p_command->'rows') is distinct from 'array' then raise exception 'Rows required'; end if;
  if jsonb_array_length(p_command->'rows') not between 1 and 50 then raise exception 'Row limit'; end if;
  if (select count(distinct lower(btrim(value->>'name'))) from jsonb_array_elements(p_command->'rows'))<>jsonb_array_length(p_command->'rows') then raise exception 'Duplicate catalog rows'; end if;
  insert into public.import_batches(team_id,source,file_hash,status,row_count,created_by) values(p_team,'catalog',p_command->>'fileHash','reviewed',jsonb_array_length(p_command->'rows'),auth.uid());
  for r in select value from jsonb_array_elements(p_command->'rows') loop
   perform private.teamkasse_command_v2(p_team,r||jsonb_build_object('type','savePenaltyType'));
  end loop;
 elsif cmd='recordDrinks' then
  list:=lower(btrim(p_command->>'listKey')); image:=p_command->>'imageHash'; price:=(p_command->>'unitPriceCents')::integer;
  if length(coalesce(list,'')) not between 2 and 100 or price is null or price not between 1 and 100000 or (image is not null and image !~ '^[a-f0-9]{64}$') then raise exception 'Invalid drink metadata'; end if;
  if jsonb_typeof(p_command->'cells') is distinct from 'array' then raise exception 'Cells required'; end if;
  if jsonb_array_length(p_command->'cells') not between 1 and 50 then raise exception 'Cell limit'; end if;
  if image is not null then
   insert into public.import_batches(team_id,source,file_hash,status,row_count,created_by) values(p_team,'drinks',image,'reviewed',0,auth.uid())
   on conflict(team_id,source,file_hash) do update set status='reviewed' returning id into batch;
  end if;
  for r in select value from jsonb_array_elements(p_command->'cells') loop
   player:=(r->>'playerId')::uuid; stamp:=(r->>'date')::date; qty:=(r->>'count')::integer;
   if qty is null or qty not between 1 and 500 or stamp is null or not exists(select 1 from public.players where id=player and team_id=p_team and active) then raise exception 'Invalid drink cell'; end if;
   insert into public.penalties(team_id,player_id,amount_cents,reason,date,status,source,import_batch_id,created_by)
   values(p_team,player,qty*price,'Getränke: '||qty||' x '||price||' Cent',stamp,'confirmed','drinks',batch,auth.uid()) returning id into penalty;
   insert into public.drink_consumptions(team_id,player_id,date,list_key,count,unit_price_cents,penalty_id,image_hash) values(p_team,player,stamp,list,qty,price,penalty,image);
  end loop;
  if batch is not null then update public.import_batches set row_count=row_count+jsonb_array_length(p_command->'cells') where id=batch; end if;
  for p in select id from public.players where team_id=p_team loop perform private.apply_credit(p_team,p.id); end loop;
 else
  perform private.teamkasse_command_v2(p_team,p_command);
 end if;
end $$;
revoke all on function public.teamkasse_command(uuid,jsonb) from public,anon;
grant execute on function public.teamkasse_command(uuid,jsonb) to authenticated;
create or replace function public.teamkasse_state(p_team uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'drink_consumptions',coalesce((select jsonb_agg(to_jsonb(d) order by d.date,d.id) from public.drink_consumptions d where d.team_id=p_team),'[]'::jsonb),
  'import_batches',case when private.is_manager(p_team) then coalesce((select jsonb_agg(jsonb_build_object('source',b.source,'file_hash',b.file_hash)) from public.import_batches b where b.team_id=p_team),'[]'::jsonb) else '[]'::jsonb end,
  'team',(select to_jsonb(t) from public.teams t where t.id=p_team),
  'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.code) from public.players p where p.team_id=p_team),'[]'::jsonb),
  'penalty_types',coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.penalty_types p where p.team_id=p_team),'[]'::jsonb),
  'penalties',coalesce((select jsonb_agg(case when private.is_manager(p_team) then to_jsonb(p) else to_jsonb(p)-'evidence_excerpt' end order by p.date desc,p.id) from public.penalties p where p.team_id=p_team),'[]'::jsonb),
  'transactions',case when private.is_manager(p_team) then coalesce((select jsonb_agg(to_jsonb(t) order by t.date desc,t.id) from public.transactions t where t.team_id=p_team),'[]'::jsonb)
   else coalesce((select jsonb_agg(to_jsonb(t) order by t.date desc,t.id) from public.own_payment_history(p_team) t),'[]'::jsonb) end,
  'allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.payment_allocations a where a.team_id=p_team),'[]'::jsonb),
  'audit_logs',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select id,team_id,actor_id,action,entity_id,created_at from public.audit_logs where team_id=p_team order by created_at desc limit 100) a),'[]'::jsonb),
  'memberships',case when private.role_for(p_team)='admin' then coalesce((select jsonb_agg(to_jsonb(m) order by m.user_id) from public.memberships m where m.team_id=p_team),'[]'::jsonb) else '[]'::jsonb end
 )
$$;
revoke all on function public.teamkasse_state(uuid) from public,anon;
grant execute on function public.teamkasse_state(uuid) to authenticated;

notify pgrst,'reload schema';
commit;
