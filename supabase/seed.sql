-- Only fictional sample data. Explicitly run on a development project, not production.
begin;
insert into public.teams(id,name) values('10000000-0000-4000-8000-000000000001','FC Eintracht · Demo') on conflict(id) do nothing;
insert into public.players(id,team_id,code,name,aliases) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','MK-001','Jonas Weber','{Jo}'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','MK-002','Leon Fischer','{Leo}'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','MK-003','Max Becker','{Max}')
 on conflict(id) do nothing;
insert into public.penalty_types(id,team_id,name,description,amount_cents,aliases) values
 ('20000000-0000-4000-8000-000000000100','10000000-0000-4000-8000-000000000001','Zu spät zum Training','Pünktlichkeit gehört zum Team.',500,'{"zu spät",verspätet}'),
 ('20000000-0000-4000-8000-000000000101','10000000-0000-4000-8000-000000000001','Schuhe vergessen','Ausrüstung nicht vollständig.',500,'{"Schuhe vergessen","Schuhe nicht dabei"}'),
 ('20000000-0000-4000-8000-000000000102','10000000-0000-4000-8000-000000000001','Gelbe Karte wegen Meckerns','Fairplay.',1000,'{Meckern}'),
 ('20000000-0000-4000-8000-000000000104','10000000-0000-4000-8000-000000000001','Kronkorken fallen lassen','Fiktiver Demo-Betrag – anpassbar.',200,'{Deckel,Kronkorken,Bierdeckel}')
 on conflict(id) do nothing;
insert into public.penalties(id,team_id,player_id,type_id,amount_cents,reason,date,status) values
 ('20000000-0000-4000-8000-000000000200','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000100',500,'Zu spät zum Training',current_date,'confirmed'),
 ('20000000-0000-4000-8000-000000000201','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000102',1000,'Gelbe Karte wegen Meckerns',current_date,'confirmed')
 on conflict(id) do nothing;
commit;
-- First administrator: create/invite an Auth user in Supabase, then run as database owner:
-- insert into public.memberships(team_id,user_id,role)
-- values('10000000-0000-4000-8000-000000000001','<AUTH-USER-UUID>','admin');
