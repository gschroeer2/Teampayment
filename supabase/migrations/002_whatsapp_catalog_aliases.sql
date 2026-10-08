-- Add after 001. Existing catalogs stay intact; configure team-specific recognition terms in the app.
begin;
alter table public.penalty_types add column aliases text[] not null default '{}' check(cardinality(aliases)<=30);
create or replace function public.teamkasse_command(p_team uuid,p_command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare
 actor_role public.member_role; cmd text; pid uuid; tid uuid; cat uuid; txn uuid; orig public.transactions; category public.penalty_types;
 item jsonb; split_total bigint; remaining integer; applied integer; due integer; p record; old_status public.penalty_status;
begin
 actor_role:=private.role_for(p_team); cmd:=p_command->>'type';
 if actor_role is null or actor_role not in ('cashier','admin') then raise exception 'Forbidden' using errcode='42501'; end if;
 if cmd in ('savePenaltyType','updateSettings','setMembership','anonymizePlayer') and actor_role<>'admin' then raise exception 'Admin required' using errcode='42501'; end if;
 -- Serialize all financial writes and membership changes within one team.
 perform 1 from public.teams where id=p_team for update;
 case cmd
 when 'savePlayer' then
  pid:=coalesce((p_command->>'id')::uuid,gen_random_uuid());
  if p_command ? 'id' then
   update public.players set name=p_command->>'name',code=upper(p_command->>'code'),aliases=array(select jsonb_array_elements_text(p_command->'aliases')),active=(p_command->>'active')::boolean where id=pid and team_id=p_team;
   if not found then raise exception 'Player not found'; end if;
  else
   insert into public.players(id,team_id,name,code,aliases,active) values(pid,p_team,p_command->>'name',upper(p_command->>'code'),array(select jsonb_array_elements_text(p_command->'aliases')),(p_command->>'active')::boolean);
  end if;
 when 'addPenalty' then
  pid:=(p_command->>'playerId')::uuid;cat:=(p_command->>'typeId')::uuid;
  if not exists(select 1 from public.players where id=pid and team_id=p_team and active) then raise exception 'Player inactive or missing'; end if;
  if cat is not null and not exists(select 1 from public.penalty_types where id=cat and team_id=p_team and active) then raise exception 'Category inactive'; end if;
  if p_command->>'status' not in ('confirmed','proposed') then raise exception 'Invalid status'; end if;
  insert into public.penalties(team_id,player_id,type_id,amount_cents,reason,date,status,created_by)
  values(p_team,pid,cat,(p_command->>'amountCents')::integer,p_command->>'reason',(p_command->>'date')::date,(p_command->>'status')::public.penalty_status,auth.uid());
 when 'addWhatsAppProposal' then
  pid:=(p_command->>'playerId')::uuid; cat:=(p_command->>'typeId')::uuid;
  if not exists(select 1 from public.players where id=pid and team_id=p_team and active) then raise exception 'Player inactive or missing'; end if;
  select * into category from public.penalty_types where id=cat and team_id=p_team and active;
  if not found then raise exception 'Category inactive or missing'; end if;
  if coalesce(p_command->>'messageKey','') !~ '^[a-f0-9]{64}$' or length(coalesce(p_command->>'excerpt','')) not between 1 and 1000 then raise exception 'Invalid evidence'; end if;
  -- Ignore any submitted amount/status: only the current catalog amount and proposed status are allowed.
  insert into public.penalties(team_id,player_id,type_id,amount_cents,reason,date,status,source,source_hash,evidence_excerpt,created_by)
  values(p_team,pid,cat,category.amount_cents,category.name,(p_command->>'date')::date,'proposed','whatsapp',p_command->>'messageKey',p_command->>'excerpt',auth.uid());
 when 'setPenaltyStatus' then
  pid:=(p_command->>'id')::uuid;
  select status into old_status from public.penalties where id=pid and team_id=p_team;
  if old_status is null or not ((old_status='proposed' and p_command->>'status' in ('confirmed','rejected')) or (old_status='confirmed' and p_command->>'status'='cancelled')) then raise exception 'Invalid status transition'; end if;
  if length(coalesce(p_command->>'note',''))<3 then raise exception 'Correction reason required'; end if;
  update public.penalties set status=(p_command->>'status')::public.penalty_status,correction_note=p_command->>'note' where id=pid;
  if p_command->>'status'='cancelled' then update public.payment_allocations set penalty_id=null where penalty_id=pid; end if;
 when 'addPayment' then
  if jsonb_typeof(p_command->'splits') is distinct from 'array' or jsonb_array_length(p_command->'splits') not between 1 and 50 then raise exception 'Splits required'; end if;
  select sum((value->>'amountCents')::integer) into split_total from jsonb_array_elements(p_command->'splits');
  if split_total is distinct from (p_command->>'amountCents')::bigint then raise exception 'Split total mismatch'; end if;
  if (select count(distinct value->>'playerId') from jsonb_array_elements(p_command->'splits'))<>jsonb_array_length(p_command->'splits') then raise exception 'Duplicate player split'; end if;
  insert into public.transactions(team_id,amount_cents,date,source,kind,reference,external_id,created_by)
  values(p_team,(p_command->>'amountCents')::integer,(p_command->>'date')::date,p_command->>'source','payment',coalesce(p_command->>'reference',''),p_command->>'externalId',auth.uid()) returning id into txn;
  for item in select value from jsonb_array_elements(p_command->'splits') loop
   pid:=(item->>'playerId')::uuid;remaining:=(item->>'amountCents')::integer;
   if remaining is null or remaining<=0 or remaining>100000000 or not exists(select 1 from public.players where id=pid and team_id=p_team) then raise exception 'Invalid player split'; end if;
   for p in select * from public.penalties where team_id=p_team and player_id=pid and status='confirmed' order by date,created_at,id loop
    select p.amount_cents-coalesce(sum(amount_cents),0) into due from public.payment_allocations where penalty_id=p.id;
    applied:=least(remaining,greatest(0,due));
    if applied>0 then insert into public.payment_allocations(team_id,transaction_id,player_id,penalty_id,amount_cents) values(p_team,txn,pid,p.id,applied);remaining:=remaining-applied;end if;
    exit when remaining=0;
   end loop;
   if remaining>0 then insert into public.payment_allocations(team_id,transaction_id,player_id,amount_cents) values(p_team,txn,pid,remaining); end if;
  end loop;
 when 'refundPayment' then
  select * into orig from public.transactions where id=(p_command->>'id')::uuid and team_id=p_team and kind='payment';
  if not found then raise exception 'Payment not found'; end if;
  if length(coalesce(p_command->>'note',''))<3 then raise exception 'Refund reason required'; end if;
  insert into public.transactions(team_id,amount_cents,date,source,kind,reference,reverses_id,created_by)
  values(p_team,-orig.amount_cents,(p_command->>'date')::date,orig.source,'refund',p_command->>'note',orig.id,auth.uid()) returning id into txn;
  insert into public.payment_allocations(team_id,transaction_id,player_id,penalty_id,amount_cents)
   select team_id,txn,player_id,penalty_id,-amount_cents from public.payment_allocations where transaction_id=orig.id;
 when 'savePenaltyType' then
  if p_command ? 'aliases' then
   if jsonb_typeof(p_command->'aliases') is distinct from 'array' then raise exception 'Aliases must be an array'; end if;
   if jsonb_array_length(p_command->'aliases')>30 or exists(select 1 from jsonb_array_elements(p_command->'aliases') v where jsonb_typeof(v)<>'string' or length(trim(v#>>'{}')) not between 2 and 100) then raise exception 'Invalid aliases'; end if;
  end if;
  cat:=coalesce((p_command->>'id')::uuid,gen_random_uuid());
  if p_command ? 'id' then
   update public.penalty_types set name=p_command->>'name',description=p_command->>'description',amount_cents=(p_command->>'amountCents')::integer,active=(p_command->>'active')::boolean,aliases=array(select jsonb_array_elements_text(coalesce(p_command->'aliases','[]'::jsonb))) where id=cat and team_id=p_team;
   if not found then raise exception 'Category not found'; end if;
  else insert into public.penalty_types(id,team_id,name,description,amount_cents,active,aliases) values(cat,p_team,p_command->>'name',p_command->>'description',(p_command->>'amountCents')::integer,(p_command->>'active')::boolean,array(select jsonb_array_elements_text(coalesce(p_command->'aliases','[]'::jsonb))));end if;
 when 'anonymizePlayer' then
  pid:=(p_command->>'playerId')::uuid;
  if p_command->>'confirmation' is distinct from 'ANONYMISIEREN' then raise exception 'Explicit confirmation required';end if;
  update public.players set name='Anonymisierter Spieler',aliases='{}',active=false where team_id=p_team and id=pid;
  if not found then raise exception 'Player not found';end if;
  update public.penalties set reason='Grund anonymisiert',correction_note=null,evidence_excerpt=null where team_id=p_team and player_id=pid;
  update public.transactions set reference='Verwendungszweck anonymisiert' where team_id=p_team and id in
   (select transaction_id from public.payment_allocations where team_id=p_team and player_id=pid);
  delete from public.memberships where team_id=p_team and player_id=pid and role='player';
  update public.memberships set player_id=null where team_id=p_team and player_id=pid;
  -- Free-text audit snapshots can mention a person anywhere. Remove snapshots for the team;
  -- retain the structural chronology and entity IDs. Do not copy personal text into this action.
  update public.audit_logs set before_data=null,after_data=null where team_id=p_team;
  insert into public.audit_logs(team_id,actor_id,action,entity_id) values(p_team,auth.uid(),'privacy:anonymize',pid::text);
 when 'updateSettings' then
  update public.teams set retention_days=(p_command->>'retentionDays')::integer where id=p_team;
 when 'setMembership' then
  tid:=(p_command->>'userId')::uuid;pid:=(p_command->>'playerId')::uuid;
  if exists(select 1 from public.memberships where team_id=p_team and user_id=tid and role='admin') and p_command->>'role'<>'admin'
   and (select count(*) from public.memberships where team_id=p_team and role='admin')<=1 then raise exception 'Cannot demote last admin';end if;
  insert into public.memberships(team_id,user_id,role,player_id) values(p_team,tid,(p_command->>'role')::public.member_role,pid)
  on conflict(team_id,user_id) do update set role=excluded.role,player_id=excluded.player_id;
 else raise exception 'Unknown command';
 end case;
 for p in select id from public.players where team_id=p_team loop perform private.apply_credit(p_team,p.id);end loop;
end $$;
create or replace function public.teamkasse_state(p_team uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
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

commit;
