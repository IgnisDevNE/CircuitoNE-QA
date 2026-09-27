-- Fixtures próprias e rollback integral; nenhum projeto hospedado.
begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.reject(statement text,expected_state text) returns void language plpgsql as $$
begin begin execute statement; exception when others then
  if sqlstate=expected_state then return; end if;
  raise exception 'Expected %, got %: %',expected_state,sqlstate,sqlerrm;
end; raise exception 'Operation unexpectedly succeeded: %',statement; end $$;
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','81000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::void
$$;
create function pg_temp.payload() returns jsonb language sql as $$
 select '{"name":"Evento sintético","kind":"festa","description":"**Música**","starts_at":"2099-01-01T18:00:00-03:00","ends_at":null,"city":"Recife","state_code":"PE","venue":"Local sintético","is_free":true,"lineup":[{"artist_id":"82000000-0000-4000-8000-000000000001"},{"name":"Convidado livre"},{"artist_id":"82000000-0000-4000-8000-000000000003"}]}'::jsonb
$$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.reject(text,text),pg_temp.actor(integer),pg_temp.payload() to anon,authenticated;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
select ('81000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'event-'||n||'@example.invalid',now(),'558198100000'||n,now() from generate_series(1,3) n;
insert into private.account_details(user_id,name,cpf,birth_date,city,state_code,phone_is_whatsapp,registration_request_id,registration_hash)
select ('81000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Pessoa sintética '||n,(array['52998224725','12345678909','11144477735'])[n],'1990-01-01','Recife','PE',true,gen_random_uuid(),'events-test' from generate_series(1,3) n;
insert into public.profiles(id,owner_id,kind,name,city,state_code,published) values
('82000000-0000-4000-8000-000000000001','81000000-0000-4000-8000-000000000002','artist','Nome creditado','Recife','PE',true),
('82000000-0000-4000-8000-000000000002','81000000-0000-4000-8000-000000000003','artist','Artista privado','Recife','PE',false),
('82000000-0000-4000-8000-000000000003','81000000-0000-4000-8000-000000000002','artist','Outro crédito','Recife','PE',true);
insert into public.artist_profiles(profile_id) select id from public.profiles where id::text like '82000000-%';
set local role authenticated;
select pg_temp.actor(1);
select set_config('test.c',public.create_collective('{"kind":"collective","name":"Organizador sintético","description":"Só fixture","activity":"Música","city":"Recife","state_code":"PE"}',gen_random_uuid())::text,true);
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload(),gen_random_uuid())$q$,'42501');
reset role;
update public.collectives set state='approved' where id=current_setting('test.c')::uuid;
insert into private.collective_memberships(collective_id,user_id,role_id) select id,'81000000-0000-4000-8000-000000000003',member_role_id from public.collectives where id=current_setting('test.c')::uuid;
set local role authenticated;
select pg_temp.actor(3);
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload(),gen_random_uuid())$q$,'42501');
select pg_temp.assert_true(public.list_collective_events(current_setting('test.c')::uuid)='[]'::jsonb,'Membro sem permissão acessa gestão');
select pg_temp.actor(1);
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"starts_at":"2099-01-01T18:00"}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"ends_at":"2099-01-01T18:00:00-03:00"}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"starts_at":"infinity"}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"kind":"outros"}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"is_free":false}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"ticket_url":"https://example.invalid"}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"is_free":false,"ticket_url":"javascript:alert(1)"}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"lineup":[{"artist_id":"82000000-0000-4000-8000-000000000002"}]}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"lineup":[{"name":" "}]}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"lineup":[{"name":{"email":"private@example.invalid"}}]}',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"lineup":[{"artist_id":"82000000-0000-4000-8000-000000000001"},{"artist_id":"82000000-0000-4000-8000-000000000001"}]}',gen_random_uuid())$q$,'22023');
select set_config('test.event',public.create_event(current_setting('test.c')::uuid,pg_temp.payload(),'83000000-0000-4000-8000-000000000001')::text,true);
select pg_temp.assert_true(public.create_event(current_setting('test.c')::uuid,pg_temp.payload(),'83000000-0000-4000-8000-000000000001')=current_setting('test.event')::uuid,'Retry duplicou evento');
select pg_temp.reject($q$select public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"name":"Outro"}','83000000-0000-4000-8000-000000000001')$q$,'22023');
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->>'state'='draft','Proprietário não lê rascunho');
select pg_temp.assert_true(public.list_collective_events(current_setting('test.c')::uuid)->0->>'id'=current_setting('test.event'),'Proprietário não descobre seu rascunho');
select pg_temp.reject($q$update public.events set state='published'$q$,'42501');
select set_config('test.editor',public.save_collective_role(current_setting('test.c')::uuid,null,'Editor',array['edit_events'])::text,true);
select public.assign_collective_role(current_setting('test.c')::uuid,'81000000-0000-4000-8000-000000000003',current_setting('test.editor')::uuid);
select pg_temp.actor(3);
select public.update_event(current_setting('test.event')::uuid,1,'{"name":"Editado"}');
select pg_temp.reject($q$select public.publish_event(current_setting('test.event')::uuid,2)$q$,'42501');
select pg_temp.actor(2);
select pg_temp.assert_true(public.list_collective_events(current_setting('test.c')::uuid)='[]'::jsonb,'Terceiro listou gestão de eventos');
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid) is null,'Artista vinculado leu rascunho');
select pg_temp.reject($q$select public.update_event(current_setting('test.event')::uuid,2,'{"name":"Invadido"}')$q$,'42501');
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid) is null,'Rascunho público');
select pg_temp.assert_true((select count(*) from public.events)=0,'Rascunho exposto pela Data API');
set local role authenticated;
select pg_temp.actor(1);
select public.publish_event(current_setting('test.event')::uuid,2);
select pg_temp.actor(3);
select pg_temp.reject($q$select public.update_event(current_setting('test.event')::uuid,3,'{"name":"Invadido"}')$q$,'42501');
select pg_temp.actor(1);
select public.save_collective_role(current_setting('test.c')::uuid,current_setting('test.editor')::uuid,'Editor',array['edit_events','publish_events']);
select pg_temp.actor(3);
select public.update_event(current_setting('test.event')::uuid,3,'{"starts_at":"2099-01-02T18:00:00-03:00"}');
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->>'rescheduled_at' is not null,'Reagendamento sem aviso');
select pg_temp.reject($q$select public.cancel_event(current_setting('test.event')::uuid,4)$q$,'42501');
select pg_temp.reject($q$select public.update_event(current_setting('test.event')::uuid,3,'{"name":"Desatualizado"}')$q$,'40001');
select pg_temp.actor(1);
select pg_temp.reject($q$select public.update_event(current_setting('test.event')::uuid,4,'{"name":"Parcial","lineup":[{"name":""}]}')$q$,'22023');
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->>'name'='Editado','Falha no lineup deixou atualização parcial');
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_true(jsonb_array_length(public.list_events('future'))=1,'Publicado ausente/duplicado na agenda');
select pg_temp.assert_true(jsonb_array_length(public.list_events('future','82000000-0000-4000-8000-000000000001'))=1,'Agenda ignora lineup explícito');
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->'lineup'->0->>'name'='Nome creditado','Nome creditado incorreto');
reset role;
select pg_temp.assert_true(private.event_period('2026-01-01T21:00Z',null,'2026-01-02T02:59:59Z')='ongoing','Sem fim terminou antes do dia local');
select pg_temp.assert_true(private.event_period('2026-01-01T21:00Z',null,'2026-01-02T03:00Z')='past','Sem fim ultrapassou dia local');
select pg_temp.assert_true(private.event_period('2026-01-01T21:00Z','2026-01-01T22:00Z','2026-01-01T22:00Z')='past','Fim inclusivo incorreto');
update public.profiles set published=false where id='82000000-0000-4000-8000-000000000001';
set local role anon;
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->'lineup'->0->>'artist_id' is null,'Perfil privado tem link público');
reset role;
delete from public.profiles where id='82000000-0000-4000-8000-000000000001';
set local role anon;
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->'lineup'->0->>'name'='Nome creditado','Exclusão de atuação apagou crédito histórico');
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->'lineup'->0->>'artist_id' is null,'Atuação excluída mantém link');
reset role;
delete from auth.users where id='81000000-0000-4000-8000-000000000002';
select pg_temp.assert_true(not exists(select from private.account_details where user_id='81000000-0000-4000-8000-000000000002'),'Conta não foi eliminada');
select pg_temp.assert_true(not exists(select from private.event_lineup where artist_id in ('82000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000003')),'Exclusão preservou identificador artístico');
update public.profiles set name='Nome creditado',published=true where id='82000000-0000-4000-8000-000000000002';
set local role anon;
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->'lineup'->2='{"name":"Outro crédito","artist_id":null}'::jsonb,'Exclusão de conta não preservou somente crédito sem vínculo');
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->'lineup'->1->>'name'='Convidado livre','Exclusão afetou outro participante');
select pg_temp.assert_true(jsonb_array_length(public.list_events('future'))=1,'Exclusão da conta apagou evento');
select pg_temp.assert_true(public.list_events('future','82000000-0000-4000-8000-000000000002')='[]'::jsonb,'Nome igual reassociou crédito a outro perfil');
reset role;
update public.collectives set state='suspended' where id=current_setting('test.c')::uuid;
set local role anon;
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid) is null,'Coletivo suspenso mantém página de evento');
select pg_temp.assert_true(jsonb_array_length(public.list_events('future'))=0,'Coletivo suspenso mantém agenda');
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.reject($q$select public.cancel_event(current_setting('test.event')::uuid,4)$q$,'42501');
reset role;
update public.collectives set state='approved' where id=current_setting('test.c')::uuid;
set local role authenticated;
select public.cancel_event(current_setting('test.event')::uuid,4);
select public.cancel_event(current_setting('test.event')::uuid,5);
select set_config('test.draft',public.create_event(current_setting('test.c')::uuid,pg_temp.payload()||'{"lineup":[]}',gen_random_uuid())::text,true);
select public.cancel_event(current_setting('test.draft')::uuid,1);
select pg_temp.assert_true(public.list_collective_events(current_setting('test.c')::uuid)->0->>'id'=current_setting('test.draft'),'Gestão ordena futuro distante antes do próximo');
select pg_temp.reject($q$select public.publish_event(current_setting('test.draft')::uuid,2)$q$,'22023');
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_true(public.get_event(current_setting('test.event')::uuid)->>'state'='cancelled','Cancelado publicado perdeu página de aviso');
select pg_temp.assert_true(public.get_event(current_setting('test.draft')::uuid) is null,'Cancelar tornou rascunho público');
select pg_temp.assert_true(jsonb_array_length(public.list_events('future'))=0,'Cancelado listado na agenda');
select pg_temp.assert_true((select count(*) from public.events)=0,'Cancelado exposto na listagem REST');
reset role;
-- Leitura/escrita privada não pode ser contornada fora das RPCs.
select pg_temp.assert_true(not has_table_privilege('authenticated','private.event_lineup','SELECT'),'Lineup privado tem grant');
select pg_temp.assert_true(not has_table_privilege('authenticated','private.event_details','SELECT'),'Autoria privada tem grant');
select pg_temp.assert_true(not has_function_privilege('anon','public.create_event(uuid,jsonb,uuid)','EXECUTE'),'Anônimo executa mutação');
select pg_temp.assert_true(not has_function_privilege('authenticated','private.replace_event_lineup(uuid,jsonb)','EXECUTE'),'Cliente executa helper de escrita');
select pg_temp.reject($q$update public.events set ends_at=starts_at where id=current_setting('test.event')::uuid$q$,'23514');
select pg_temp.reject($q$update public.events set timezone='UTC' where id=current_setting('test.event')::uuid$q$,'23514');
select pg_temp.reject($q$update public.events set is_free=false,ticket_url=null where id=current_setting('test.event')::uuid$q$,'23514');
-- Agenda vinculada a dois organizadores, empate estável e cursor sem duplicação.
set local role authenticated;
select pg_temp.actor(3);
select set_config('test.other',public.create_collective('{"kind":"collective","name":"Outro organizador","description":"Só fixture","activity":"Música","city":"Recife","state_code":"PE"}',gen_random_uuid())::text,true);
reset role;
update public.collectives set state='approved' where id=current_setting('test.other')::uuid;
insert into public.events(id,collective_id,name,kind,starts_at,city,state_code,venue,is_free,state,first_published_at)
select ('84000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  current_setting(case when n%2=0 then 'test.c' else 'test.other' end)::uuid,'Histórico '||n,'festival',
  '2000-01-01T21:00Z'::timestamptz+(n/2)*interval '1 day','Recife','PE','Local sintético',true,'published',now()
  from generate_series(1,53) n;
insert into private.event_lineup(event_id,position,artist_id,credited_name)
select id,0,'82000000-0000-4000-8000-000000000002','Nome creditado' from public.events where id::text like '84000000-%';
set local role anon;
select set_config('test.page',public.list_events('past','82000000-0000-4000-8000-000000000002')::text,true);
select pg_temp.assert_true(jsonb_array_length(current_setting('test.page')::jsonb)=50,'Página sem limite correto');
select pg_temp.assert_true(current_setting('test.page')::jsonb->0->>'id'='84000000-0000-4000-8000-000000000053','Passado sem ordem decrescente estável');
select pg_temp.assert_true((select count(distinct value->>'collective_id') from jsonb_array_elements(current_setting('test.page')::jsonb))=2,'Agenda perde organizador');
select pg_temp.assert_true(jsonb_array_length(public.list_events('past','82000000-0000-4000-8000-000000000002',
  (current_setting('test.page')::jsonb->49->>'starts_at')::timestamptz,(current_setting('test.page')::jsonb->49->>'id')::uuid))=3,'Cursor perde ou duplica eventos');
select pg_temp.reject($q$select public.list_events('invalid')$q$,'22023');
select pg_temp.reject($q$select public.list_events('past',null,now(),null)$q$,'22023');
reset role;
set local role authenticated;
select pg_temp.actor(1);
select set_config('test.management',public.list_collective_events(current_setting('test.c')::uuid,'past')::text,true);
select pg_temp.assert_true(jsonb_array_length(current_setting('test.management')::jsonb)=26,'Gestão misturou coletivos');
select pg_temp.assert_true(current_setting('test.management')::jsonb->0->>'id'='84000000-0000-4000-8000-000000000052','Gestão ordenou passado incorretamente');
select pg_temp.assert_true(jsonb_array_length(public.list_collective_events(current_setting('test.c')::uuid,'past',
  (current_setting('test.management')::jsonb->0->>'starts_at')::timestamptz,(current_setting('test.management')::jsonb->0->>'id')::uuid))=25,'Cursor de gestão repete evento');
select pg_temp.reject($q$select public.list_collective_events(current_setting('test.c')::uuid,'invalid')$q$,'22023');
reset role;
update private.account_details set state='suspended' where user_id='81000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.actor(3);
select pg_temp.assert_true(public.list_events('past')='[]'::jsonb,'Conta suspensa acessou agenda autenticada');
select pg_temp.assert_true(public.list_collective_events(current_setting('test.other')::uuid)='[]'::jsonb,'Conta suspensa acessou gestão');
reset role;
set constraints all immediate;
rollback;
