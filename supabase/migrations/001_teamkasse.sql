-- TeamKasse v1. All writes are atomic RPCs; clients never receive a service-role key.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create type public.member_role as enum ('player','cashier','admin');
create type public.penalty_status as enum ('proposed','confirmed','rejected','cancelled');

create table public.teams (
 id uuid primary key default gen_random_uuid(), name text not null check (length(name) between 2 and 100),
 retention_days integer not null default 365 check (retention_days between 30 and 3650), created_at timestamptz not null default now()
);
create table public.players (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id),
 code text not null check (code ~ '^MK-[0-9]{3,6}$'), name text not null check (length(name) between 2 and 100),
 aliases text[] not null default '{}', active boolean not null default true, created_at timestamptz not null default now(),
 unique(team_id,code), unique(team_id,id), check (cardinality(aliases)<=20)
);
create table public.memberships (
 team_id uuid not null references public.teams(id), user_id uuid not null references auth.users(id) on delete cascade,
 role public.member_role not null default 'player', player_id uuid,
 primary key(team_id,user_id), unique(team_id,player_id),
 foreign key(team_id,player_id) references public.players(team_id,id),
 check (role <> 'player' or player_id is not null)
);
create table public.penalty_types (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id),
 name text not null check (length(name) between 2 and 100), description text not null default '' check(length(description)<=500),
 amount_cents integer not null check(amount_cents between 1 and 100000000), active boolean not null default true, unique(team_id,id)
);
create table public.import_batches (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id),
 source text not null check (source in ('bank','paypal','whatsapp')), file_hash text not null check(length(file_hash)=64),
 status text not null default 'pending' check(status in ('pending','reviewed','rejected')),
 row_count integer not null default 0 check(row_count>=0), created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(), unique(team_id,source,file_hash), unique(team_id,id)
);
create table public.penalties (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id), player_id uuid not null,
 type_id uuid, amount_cents integer not null check(amount_cents between 1 and 100000000),
 reason text not null check(length(reason) between 3 and 500), date date not null,
 status public.penalty_status not null default 'proposed', correction_note text check(length(correction_note) between 3 and 500),
 source text not null default 'manual' check(source in ('manual','whatsapp')), source_hash text,
 evidence_excerpt text check(length(evidence_excerpt)<=1000), import_batch_id uuid,
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
 foreign key(team_id,player_id) references public.players(team_id,id),
 foreign key(team_id,type_id) references public.penalty_types(team_id,id),
 foreign key(team_id,import_batch_id) references public.import_batches(team_id,id),
 unique(team_id,source_hash), unique(team_id,id), unique(team_id,id,player_id)
);
create table public.transactions (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id),
 amount_cents integer not null check(amount_cents between -100000000 and 100000000 and amount_cents<>0),
 date date not null, source text not null check(source in ('bank','paypal','cash')),
 kind text not null check(kind in ('payment','refund','transfer')), reference text not null default '' check(length(reference)<=200),
 external_id text check(length(external_id) between 1 and 200), reverses_id uuid, import_batch_id uuid,
 created_by uuid references auth.users(id) on delete set null, created_at timestamptz not null default now(),
 foreign key(team_id,reverses_id) references public.transactions(team_id,id),
 foreign key(team_id,import_batch_id) references public.import_batches(team_id,id),
 unique(team_id,id), unique(team_id,source,external_id), unique(team_id,reverses_id),
 check((kind='payment' and amount_cents>0 and reverses_id is null) or (kind='refund' and amount_cents<0 and reverses_id is not null) or (kind='transfer' and reverses_id is null))
);
create table public.payment_allocations (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id), transaction_id uuid not null,
 player_id uuid not null, penalty_id uuid, amount_cents integer not null check(amount_cents<>0 and abs(amount_cents)<=100000000),
 foreign key(team_id,transaction_id) references public.transactions(team_id,id),
 foreign key(team_id,player_id) references public.players(team_id,id),
 foreign key(team_id,penalty_id,player_id) references public.penalties(team_id,id,player_id)
);
create table public.audit_logs (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.teams(id),
 actor_id uuid, action text not null, entity_id text not null, before_data jsonb, after_data jsonb,
 created_at timestamptz not null default now()
);
create index penalties_account_idx on public.penalties(team_id,player_id,status,date);
create index allocations_player_idx on public.payment_allocations(team_id,player_id);
create index allocations_penalty_idx on public.payment_allocations(penalty_id);
create index allocations_transaction_idx on public.payment_allocations(transaction_id);
create index memberships_user_idx on public.memberships(user_id);
create index audit_team_date_idx on public.audit_logs(team_id,created_at desc);

create function private.role_for(p_team uuid) returns public.member_role language sql stable security definer set search_path='' as $$
 select role from public.memberships where team_id=p_team and user_id=auth.uid()
$$;
create function private.is_manager(p_team uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(private.role_for(p_team) in ('cashier','admin'),false)
$$;
create function private.owns_player(p_team uuid,p_player uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships where team_id=p_team and user_id=auth.uid() and player_id=p_player)
$$;
revoke all on all functions in schema private from public;
grant execute on function private.role_for(uuid), private.is_manager(uuid), private.owns_player(uuid,uuid) to authenticated;

alter table public.teams enable row level security;
alter table public.players enable row level security;
alter table public.memberships enable row level security;
alter table public.penalty_types enable row level security;
alter table public.penalties enable row level security;
alter table public.transactions enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.import_batches enable row level security;
alter table public.audit_logs enable row level security;
create policy teams_read on public.teams for select to authenticated using(private.role_for(id) is not null);
create policy players_read on public.players for select to authenticated using(private.is_manager(team_id) or private.owns_player(team_id,id));
create policy memberships_read on public.memberships for select to authenticated using(user_id=auth.uid() or private.role_for(team_id)='admin');
create policy types_read on public.penalty_types for select to authenticated using(private.role_for(team_id) is not null);
create policy penalties_read on public.penalties for select to authenticated using(private.is_manager(team_id) or private.owns_player(team_id,player_id));
-- Raw bank/PayPal rows can contain other players' private data. Players use own_payment_history below.
create policy transactions_read on public.transactions for select to authenticated using(private.is_manager(team_id));
create policy allocations_read on public.payment_allocations for select to authenticated using(private.is_manager(team_id) or private.owns_player(team_id,player_id));
create policy imports_read on public.import_batches for select to authenticated using(private.is_manager(team_id));
create policy audit_read on public.audit_logs for select to authenticated using(private.role_for(team_id)='admin');
revoke all on public.teams,public.players,public.memberships,public.penalty_types,public.penalties,public.transactions,public.payment_allocations,public.import_batches,public.audit_logs from anon,authenticated;
grant select on public.teams,public.players,public.memberships,public.penalty_types,public.penalties,public.transactions,public.payment_allocations,public.import_batches,public.audit_logs to authenticated;

create function private.audit_change() returns trigger language plpgsql security definer set search_path='' as $$
declare b jsonb; a jsonb; tid uuid;
begin
 if TG_OP<>'INSERT' then b:=to_jsonb(old)-'evidence_excerpt'; end if;
 if TG_OP<>'DELETE' then a:=to_jsonb(new)-'evidence_excerpt'; end if;
 tid:=coalesce((a->>'team_id')::uuid,(b->>'team_id')::uuid,(a->>'id')::uuid,(b->>'id')::uuid);
 insert into public.audit_logs(team_id,actor_id,action,entity_id,before_data,after_data)
 values(tid,auth.uid(),TG_TABLE_NAME||':'||TG_OP,coalesce(a->>'id',b->>'id',a->>'user_id',b->>'user_id'),b,a);
 return coalesce(new,old);
end $$;
revoke all on function private.audit_change() from public;
create trigger audit_teams after update on public.teams for each row execute function private.audit_change();
create trigger audit_players after insert or update or delete on public.players for each row execute function private.audit_change();
create trigger audit_memberships after insert or update or delete on public.memberships for each row execute function private.audit_change();
create trigger audit_types after insert or update or delete on public.penalty_types for each row execute function private.audit_change();
create trigger audit_penalties after insert or update or delete on public.penalties for each row execute function private.audit_change();
create trigger audit_transactions after insert or update or delete on public.transactions for each row execute function private.audit_change();
create trigger audit_allocations after insert or update or delete on public.payment_allocations for each row execute function private.audit_change();
create trigger audit_imports after insert or update or delete on public.import_batches for each row execute function private.audit_change();

create function private.check_ledger() returns trigger language plpgsql security definer set search_path='' as $$
declare tid uuid;
begin
 tid:=coalesce(new.team_id,old.team_id);
 if exists(select 1 from public.transactions t left join public.payment_allocations a on a.transaction_id=t.id
  where t.team_id=tid group by t.id having coalesce(sum(a.amount_cents),0)<>case when t.kind='transfer' then 0 else t.amount_cents end)
 then raise exception 'Transaction allocation total mismatch'; end if;
 if exists(select 1 from public.payment_allocations a join public.transactions t on t.id=a.transaction_id where a.team_id=tid
  and ((t.kind='payment' and a.amount_cents<0) or (t.kind='refund' and a.amount_cents>0) or t.kind='transfer'))
 then raise exception 'Invalid allocation sign'; end if;
 if exists(select 1 from public.penalties p join public.payment_allocations a on a.penalty_id=p.id where p.team_id=tid
  group by p.id having sum(a.amount_cents)<0 or sum(a.amount_cents)>p.amount_cents or (p.status<>'confirmed' and sum(a.amount_cents)<>0))
 then raise exception 'Invalid penalty allocation'; end if;
 if exists(select 1 from public.payment_allocations where team_id=tid group by player_id having sum(amount_cents)<0)
 then raise exception 'Negative player payments'; end if;
 return null;
end $$;
revoke all on function private.check_ledger() from public;
create constraint trigger check_transaction_ledger after insert or update or delete on public.transactions deferrable initially deferred for each row execute function private.check_ledger();
create constraint trigger check_allocation_ledger after insert or update or delete on public.payment_allocations deferrable initially deferred for each row execute function private.check_ledger();
create constraint trigger check_penalty_ledger after update on public.penalties deferrable initially deferred for each row execute function private.check_ledger();

create function public.own_payment_history(p_team uuid) returns table(id uuid,team_id uuid,amount_cents bigint,date date,source text,reference text,external_id text,kind text,reverses_id uuid,created_at timestamptz)
language sql stable security definer set search_path='' as $$
 select t.id,t.team_id,sum(a.amount_cents),t.date,t.source,'Eigener Zahlungsanteil'::text,null::text,t.kind,t.reverses_id,t.created_at
 from public.transactions t join public.payment_allocations a on a.transaction_id=t.id
 where t.team_id=p_team and private.owns_player(p_team,a.player_id)
 group by t.id
$$;
revoke all on function public.own_payment_history(uuid) from public,anon;
grant execute on function public.own_payment_history(uuid) to authenticated;

-- Reuse excess receipts when a demand is confirmed, cancelled, or refunded.
-- Reversed receipts keep their historical allocations; their net balance is zero.
create function private.apply_credit(p_team uuid,p_player uuid) returns void language plpgsql security definer set search_path='' as $$
declare credit record; demand record; available integer; due integer; used integer;
begin
 for credit in select a.* from public.payment_allocations a join public.transactions t on t.id=a.transaction_id
  where a.team_id=p_team and a.player_id=p_player and a.penalty_id is null and a.amount_cents>0
  and not exists(select 1 from public.transactions r where r.reverses_id=a.transaction_id)
  order by t.date,t.created_at,a.id loop
  available:=credit.amount_cents;
  for demand in select * from public.penalties where team_id=p_team and player_id=p_player and status='confirmed' order by date,created_at,id loop
   select demand.amount_cents-coalesce(sum(amount_cents),0) into due from public.payment_allocations where penalty_id=demand.id;
   used:=least(available,greatest(0,due));
   if used=0 then continue;end if;
   if used=available then
    update public.payment_allocations set penalty_id=demand.id where id=credit.id;
    exit;
   else
    available:=available-used;
    update public.payment_allocations set amount_cents=available where id=credit.id;
    insert into public.payment_allocations(team_id,transaction_id,player_id,penalty_id,amount_cents) values(p_team,credit.transaction_id,p_player,demand.id,used);
   end if;
  end loop;
 end loop;
end $$;
revoke all on function private.apply_credit(uuid,uuid) from public,anon,authenticated;

create function public.teamkasse_command(p_team uuid,p_command jsonb) returns void language plpgsql security definer set search_path='' as $$
declare
 actor_role public.member_role; cmd text; pid uuid; tid uuid; cat uuid; txn uuid; orig public.transactions;
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
  cat:=coalesce((p_command->>'id')::uuid,gen_random_uuid());
  if p_command ? 'id' then
   update public.penalty_types set name=p_command->>'name',description=p_command->>'description',amount_cents=(p_command->>'amountCents')::integer,active=(p_command->>'active')::boolean where id=cat and team_id=p_team;
   if not found then raise exception 'Category not found'; end if;
  else insert into public.penalty_types(id,team_id,name,description,amount_cents,active) values(cat,p_team,p_command->>'name',p_command->>'description',(p_command->>'amountCents')::integer,(p_command->>'active')::boolean);end if;
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
revoke all on function public.teamkasse_command(uuid,jsonb) from public,anon;
grant execute on function public.teamkasse_command(uuid,jsonb) to authenticated;

-- Retention applies to imported evidence, never silently to the financial ledger.
-- Run daily using the operator's trusted scheduler / SQL connection.
create function public.purge_expired_import_evidence() returns integer language plpgsql security definer set search_path='' as $$
declare n integer;
begin
 update public.penalties p set evidence_excerpt=null from public.teams t
 where p.team_id=t.id and p.evidence_excerpt is not null and p.created_at < now()-make_interval(days=>t.retention_days);
 get diagnostics n=row_count;
 return n;
end $$;
revoke all on function public.purge_expired_import_evidence() from public,anon,authenticated;
-- Evidence must not be copied to long-lived audit records; current v1 has no evidence ingestion endpoint.

-- One snapshot for a consistent dashboard, unaffected by PostgREST's 1000-row default.
-- SECURITY INVOKER preserves all table RLS policies.
create function public.teamkasse_state(p_team uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object(
  'team',(select to_jsonb(t) from public.teams t where t.id=p_team),
  'players',coalesce((select jsonb_agg(to_jsonb(p) order by p.code) from public.players p where p.team_id=p_team),'[]'::jsonb),
  'penalty_types',coalesce((select jsonb_agg(to_jsonb(p) order by p.name) from public.penalty_types p where p.team_id=p_team),'[]'::jsonb),
  'penalties',coalesce((select jsonb_agg(to_jsonb(p)-'evidence_excerpt' order by p.date desc,p.id) from public.penalties p where p.team_id=p_team),'[]'::jsonb),
  'transactions',case when private.is_manager(p_team) then coalesce((select jsonb_agg(to_jsonb(t) order by t.date desc,t.id) from public.transactions t where t.team_id=p_team),'[]'::jsonb)
   else coalesce((select jsonb_agg(to_jsonb(t) order by t.date desc,t.id) from public.own_payment_history(p_team) t),'[]'::jsonb) end,
  'allocations',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.payment_allocations a where a.team_id=p_team),'[]'::jsonb),
  'audit_logs',coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from (select id,team_id,actor_id,action,entity_id,created_at from public.audit_logs where team_id=p_team order by created_at desc limit 100) a),'[]'::jsonb),
  'memberships',case when private.role_for(p_team)='admin' then coalesce((select jsonb_agg(to_jsonb(m) order by m.user_id) from public.memberships m where m.team_id=p_team),'[]'::jsonb) else '[]'::jsonb end
 )
$$;
revoke all on function public.teamkasse_state(uuid) from public,anon;
grant execute on function public.teamkasse_state(uuid) to authenticated;
