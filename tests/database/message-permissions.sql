begin;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
select ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'race-collective-'||n||'@example.invalid',now(),'558199700000'||n,now() from generate_series(1,3) n;
insert into private.account_details(user_id,name,cpf,birth_date,city,state_code,phone_is_whatsapp,registration_request_id,registration_hash)
select ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Sintético '||n,(array['52998224725','12345678909','11144477735'])[n],'1990-01-01','Recife','PE',true,gen_random_uuid(),'test-only' from generate_series(1,3) n;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
select ('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'totp','verified',now(),now() from generate_series(1,3) n;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at) values
('72000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','aal2',now(),now());
insert into public.collectives(id,owner_user_id,member_role_id,kind,name,description,activity,city,state_code,state) values
('74000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001','collective','Race','Somente ensaio','Música','Recife','PE','approved');
insert into private.collective_details(collective_id,kind,creator_user_id,request_id,request_hash) values
('74000000-0000-4000-8000-000000000001','collective','70000000-0000-4000-8000-000000000001',gen_random_uuid(),'test-only');
insert into private.collective_roles(id,collective_id,name,builtin) values
('75000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','Membro',true),
('75000000-0000-4000-8000-000000000002','74000000-0000-4000-8000-000000000001','Operador',false);
insert into private.collective_role_permissions(collective_id,role_id,permission) values
('74000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000002','remove_members');
insert into private.collective_memberships(collective_id,user_id,role_id)
select '74000000-0000-4000-8000-000000000001',('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'75000000-0000-4000-8000-000000000002' from generate_series(1,2) n;
insert into private.membership_requests(id,collective_id,user_id) values
('77000000-0000-4000-8000-000000000001','74000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003');


create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.reject(statement text,expected_state text) returns void language plpgsql as $$
begin begin execute statement; exception when others then if sqlstate=expected_state then return; end if;
raise exception 'Expected %, got %: %',expected_state,sqlstate,sqlerrm; end; raise exception 'Unexpected success'; end $$;
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','70000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::void
$$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.reject(text,text),pg_temp.actor(integer) to anon,authenticated;
insert into public.profiles(id,owner_id,kind,name,city,state_code)
select ('78000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'70000000-0000-4000-8000-000000000003','member','Destino sintético '||n,'Recife','PE' from generate_series(1,22) n;
set local role authenticated;
select pg_temp.actor(2);
select pg_temp.reject($q$select public.send_message('collective','74000000-0000-4000-8000-000000000001','profile','78000000-0000-4000-8000-000000000001','Sem privilégio',gen_random_uuid())$q$,'42501');
select pg_temp.actor(1);
select pg_temp.reject('select public.request_account_deletion()','55000');
select set_config('test.sent',public.send_message('collective','74000000-0000-4000-8000-000000000001','profile','78000000-0000-4000-8000-000000000001','Do proprietário',gen_random_uuid())::text,true);
select set_config('test.conversation',current_setting('test.sent')::jsonb->>'conversation_id',true);
reset role;
insert into private.collective_role_permissions(collective_id,role_id,permission) values('74000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000002','send_messages');
set local role authenticated;
select pg_temp.actor(2);
select public.send_message('collective','74000000-0000-4000-8000-000000000001','profile','78000000-0000-4000-8000-000000000001','Pode enviar',gen_random_uuid());
select pg_temp.assert_true(public.get_messages(current_setting('test.conversation')::uuid)='[]'::jsonb,'Enviar concedeu leitura');
select pg_temp.reject($q$select public.mark_conversation_read(current_setting('test.conversation')::uuid,(current_setting('test.sent')::jsonb->>'message_id')::uuid)$q$,'42501');
reset role;
insert into private.collective_role_permissions(collective_id,role_id,permission) values('74000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000002','read_messages');
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.get_messages(current_setting('test.conversation')::uuid))=2,'Ler não concedeu histórico');
select public.mark_conversation_read(current_setting('test.conversation')::uuid,(current_setting('test.sent')::jsonb->>'message_id')::uuid);
select pg_temp.actor(1);
select pg_temp.assert_true((public.list_conversations()->0->>'unread_count')::int=1,'Leitura de membro marcou outro usuário');
reset role;
delete from private.collective_role_permissions where permission='send_messages';
set local role authenticated;
select pg_temp.actor(2);
select pg_temp.reject($q$select public.send_message('collective','74000000-0000-4000-8000-000000000001','profile','78000000-0000-4000-8000-000000000001','Só ler',gen_random_uuid())$q$,'42501');
reset role;
update public.collectives set state='suspended';
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.get_messages(current_setting('test.conversation')::uuid))=2,'Suspenso perdeu histórico autorizado');
select pg_temp.actor(1);
select pg_temp.reject($q$select public.send_message('collective','74000000-0000-4000-8000-000000000001','profile','78000000-0000-4000-8000-000000000001','Suspenso',gen_random_uuid())$q$,'42501');
reset role;
update public.collectives set state='approved';
insert into private.collective_role_permissions(collective_id,role_id,permission) values('74000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000002','send_messages');
set local role authenticated;
-- Oito + os dois existentes: limite compartilhado por coletivo, mesmo com autores diferentes.
do $$ begin for n in 1..8 loop
  perform pg_temp.actor(case when n%2=0 then 1 else 2 end);
  perform public.send_message('collective','74000000-0000-4000-8000-000000000001','profile','78000000-0000-4000-8000-000000000001','Quota '||n,gen_random_uuid());
end loop; end $$;
select pg_temp.reject($q$select public.send_message('collective','74000000-0000-4000-8000-000000000001','profile','78000000-0000-4000-8000-000000000001','Onze',gen_random_uuid())$q$,'54000');
reset role;
update private.messages set created_at=now()-interval '2 minutes';
-- Vinte pares novos no dia, repartidos entre operadores, sem ultrapassar 10 envios/minuto.
do $$ begin for n in 2..20 loop
  perform pg_temp.actor(case when n%2=0 then 1 else 2 end);
  perform public.send_message('collective','74000000-0000-4000-8000-000000000001','profile',('78000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Novo par '||n,gen_random_uuid());
  update private.messages set created_at=now()-interval '2 minutes';
end loop; end $$;
set local role authenticated;
select pg_temp.reject($q$select public.send_message('collective','74000000-0000-4000-8000-000000000001','profile','78000000-0000-4000-8000-000000000021','Vinte e um',gen_random_uuid())$q$,'54000');
-- Envio em par antigo não consome nova conversa.
select public.send_message('collective','74000000-0000-4000-8000-000000000001','profile','78000000-0000-4000-8000-000000000001','Par existente',gen_random_uuid());
reset role;
update public.collectives set state='closed',owner_user_id=null;
set local role authenticated;
select pg_temp.assert_true(public.list_conversations()='[]'::jsonb,'Coletivo fechado conserva acesso');
select pg_temp.actor(3);
select pg_temp.assert_true(jsonb_array_length(public.list_conversations())=20,'Fechar coletivo apagou histórico do outro participante');
reset role;
insert into public.profiles(id,owner_id,kind,name,city,state_code) values('78000000-0000-4000-8000-000000000099','70000000-0000-4000-8000-000000000001','member','Pessoal','Recife','PE');
set local role authenticated;
select pg_temp.actor(3);
do $$ begin for n in 1..10 loop
  perform public.send_message('profile','78000000-0000-4000-8000-000000000021','profile','78000000-0000-4000-8000-000000000099','Pessoal '||n,gen_random_uuid());
end loop; end $$;
select pg_temp.reject($q$select public.send_message('profile','78000000-0000-4000-8000-000000000022','profile','78000000-0000-4000-8000-000000000099','Outra atuação não renova quota',gen_random_uuid())$q$,'54000');
reset role;
set constraints all immediate;
rollback;
