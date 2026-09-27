begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.reject(statement text,expected_state text) returns void language plpgsql as $$
begin begin execute statement; exception when others then
  if sqlstate=expected_state then return; end if;
  raise exception 'Expected %, got %: %',expected_state,sqlstate,sqlerrm;
end; raise exception 'Operation unexpectedly succeeded'; end $$;
create function pg_temp.actor(n integer,mfa boolean default true) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','91000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated',
   'aal',case when mfa then 'aal2' else 'aal1' end,'session_id','94000000-0000-4000-8000-'||lpad(n::text,12,'0'))::text,true)::void
$$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.reject(text,text),pg_temp.actor(integer,boolean) to anon,authenticated;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
select ('91000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'lifecycle-'||n||'@example.invalid',now(),'558191000000'||n,now() from generate_series(1,4) n;
insert into private.account_details(user_id,name,cpf,birth_date,city,state_code,phone_is_whatsapp,registration_request_id,registration_hash)
select ('91000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Nome cadastral privado '||n,(array['52998224725','12345678909','11144477735','93541134780'])[n],
  '1990-01-01','Recife','PE',true,gen_random_uuid(),'lifecycle-test' from generate_series(1,4) n;
insert into public.profiles(id,owner_id,kind,name,city,state_code)
select ('92000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('91000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'member','Atuação sintética '||n,'Recife','PE' from generate_series(1,4) n;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
select ('95000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('91000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'totp','verified',now(),now() from generate_series(1,4) n;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select ('94000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('91000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('95000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'aal2',now(),now() from generate_series(1,4) n;
insert into private.site_admins(user_id) values('91000000-0000-4000-8000-000000000003'),('91000000-0000-4000-8000-000000000004');
set local role authenticated;
select pg_temp.actor(1);
select set_config('test.sent',public.send_message('profile','92000000-0000-4000-8000-000000000001','profile','92000000-0000-4000-8000-000000000002','Mensagem denunciável sintética',gen_random_uuid())::text,true);
select pg_temp.actor(4);
select pg_temp.reject($q$select public.report_message((current_setting('test.sent')::jsonb->>'message_id')::uuid,'Sem participar')$q$,'42501');
select pg_temp.actor(2);
select pg_temp.reject($q$select public.report_message((current_setting('test.sent')::jsonb->>'message_id')::uuid,'x'||repeat(' ',2000))$q$,'22023');
select set_config('test.report',public.report_message((current_setting('test.sent')::jsonb->>'message_id')::uuid,'Análise sintética')::text,true);
select pg_temp.assert_true(public.report_message((current_setting('test.sent')::jsonb->>'message_id')::uuid,'Análise sintética')=current_setting('test.report')::uuid,'Retry duplicou denúncia');
select pg_temp.reject($q$select public.get_message_report(current_setting('test.report')::uuid)$q$,'42501');
select pg_temp.actor(3,false);
select pg_temp.reject($q$select public.claim_message_report(current_setting('test.report')::uuid)$q$,'42501');
select pg_temp.actor(3);
select public.claim_message_report(current_setting('test.report')::uuid);
select pg_temp.reject($q$select public.close_message_report(current_setting('test.report')::uuid,repeat(' ',2000)||'x')$q$,'22023');
reset role;
select pg_temp.reject($q$update private.message_reports set reason='x'||repeat(' ',2000) where id=current_setting('test.report')::uuid$q$,'23514');
select pg_temp.reject($q$update private.message_reports set closed_at=now(),resolution=repeat(' ',2000)||'x' where id=current_setting('test.report')::uuid$q$,'23514');
set local role authenticated;
select pg_temp.assert_true(jsonb_array_length(public.get_message_report(current_setting('test.report')::uuid)->'context')=1,'Cópia mínima ausente');
select pg_temp.assert_true(public.get_messages((current_setting('test.sent')::jsonb->>'conversation_id')::uuid)='[]'::jsonb,'Admin leu conversa inteira');
select pg_temp.actor(4);
select pg_temp.reject($q$select public.claim_message_report(current_setting('test.report')::uuid)$q$,'42501');
select pg_temp.reject($q$select public.get_message_report(current_setting('test.report')::uuid)$q$,'42501');
select pg_temp.actor(1);
select set_config('test.second',public.send_message('profile','92000000-0000-4000-8000-000000000001','profile','92000000-0000-4000-8000-000000000002','Outra mensagem sintética',gen_random_uuid())::text,true);
select pg_temp.actor(2);
select set_config('test.second_report',public.report_message((current_setting('test.second')::jsonb->>'message_id')::uuid,'Outro caso')::text,true);
select pg_temp.actor(3);
select public.claim_message_report(current_setting('test.second_report')::uuid);
select pg_temp.actor(1);
select public.request_account_deletion();
select pg_temp.assert_true(public.get_account_deletion_status()->>'state'='waiting_review','Denúncia não retém análise');
select pg_temp.reject($q$select public.send_message('profile','92000000-0000-4000-8000-000000000001','profile','92000000-0000-4000-8000-000000000002','Após pedido',gen_random_uuid())$q$,'42501');
select pg_temp.actor(2);
select pg_temp.assert_true(public.get_messages((current_setting('test.sent')::jsonb->>'conversation_id')::uuid)->0->>'sender_id' is null,'Identidade pendente vazou à conversa normal');
select pg_temp.actor(3);
select public.close_message_report(current_setting('test.second_report')::uuid,'Fechado antes do primeiro');
reset role;
select pg_temp.assert_true(not exists(select from private.report_context where report_id=current_setting('test.second_report')::uuid and author_user_id is not null),'Caso fechado retém identidade por outro caso aberto');
select pg_temp.assert_true((select identity_due_at=requested_at+interval '30 days' from private.account_deletions where user_id='91000000-0000-4000-8000-000000000001'),'Prazo não é fixo');
savepoint before_early_close;
set local role authenticated;
select pg_temp.actor(3);
select public.close_message_report(current_setting('test.report')::uuid,'Encerramento antecipado');
reset role;
select pg_temp.assert_true(not exists(select from private.account_details where user_id='91000000-0000-4000-8000-000000000001'),'Encerrar último caso não prepara exclusão imediata');
rollback to before_early_close;
-- Ensaia fronteira por relógio persistido de fixture; RPC não aceita instante do cliente.
update private.account_deletions set requested_at=now()-interval '30 days',identity_due_at=now() where user_id='91000000-0000-4000-8000-000000000001';
select private.prepare_account_deletions();
select pg_temp.assert_true(not exists(select from private.account_details where user_id='91000000-0000-4000-8000-000000000001'),'Prazo manteve identidade privada');
select pg_temp.assert_true(not exists(select from private.report_context where author_user_id='91000000-0000-4000-8000-000000000001'),'Prazo manteve identidade de denúncia');
select pg_temp.assert_true((select closed_at is null from private.message_reports where id=current_setting('test.report')::uuid),'Prazo fechou denúncia');
select pg_temp.reject($q$select private.finish_account_deletion('91000000-0000-4000-8000-000000000001')$q$,'55000');
set local role authenticated;
select pg_temp.actor(3);
select pg_temp.assert_true(public.get_message_report(current_setting('test.report')::uuid)->'context'->0->>'author_user_id' is null,'Moderador recebeu identidade apagada');
select public.close_message_report(current_setting('test.report')::uuid,'Análise encerrada');
reset role;
update private.message_reports set closed_at=now()-interval '90 days' where id=current_setting('test.report')::uuid;
select private.prepare_account_deletions();
select pg_temp.assert_true(not exists(select from private.message_reports where id=current_setting('test.report')::uuid),'Cópia sobreviveu 90 dias');
-- O executor é restrito; confirma Storage via API e exclui Auth por API antes de concluir.
update private.account_deletions set storage_done=true where user_id='91000000-0000-4000-8000-000000000001';
delete from auth.users where id='91000000-0000-4000-8000-000000000001';
select pg_temp.reject($q$select private.finish_account_deletion('91000000-0000-4000-8000-000000000001')$q$,'55000');
delete from private.storage_cleanup where owner_user_id='91000000-0000-4000-8000-000000000001';
select private.finish_account_deletion('91000000-0000-4000-8000-000000000001');
select pg_temp.assert_true(not exists(select from private.account_deletions where user_id='91000000-0000-4000-8000-000000000001'),'Tarefa concluída retém identidade');
set local role authenticated;
select pg_temp.actor(2);
select pg_temp.assert_true(public.get_messages((current_setting('test.sent')::jsonb->>'conversation_id')::uuid)->0->>'sender_name'='Conta excluída','Histórico não anonimiza remetente');
select public.request_account_deletion();
select pg_temp.assert_true(public.get_account_deletion_status()->>'state'='external_cleanup','Sem caso aberto deve preparar logo');
reset role;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at) values('91000000-0000-4000-8000-000000000005','new@example.invalid',now(),'5581910000001',now());
set local role authenticated;
select pg_temp.actor(5);
select public.complete_registration('{"name":"Cadastro novo","cpf":"52998224725","birth_date":"1990-01-01","city":"Recife","state_code":"PE","phone_is_whatsapp":true}',
  '{"kind":"member","name":"Nova atuação"}',gen_random_uuid());
select pg_temp.assert_true(public.list_conversations()='[]'::jsonb,'Mesmo CPF recuperou histórico');
reset role;
do $$ declare tab text; role_name text; begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
    foreach tab in array array['message_identities','conversations','messages','message_requests','conversation_reads','conversation_blocks','message_reports','report_context','account_deletions','storage_cleanup','moderation_audit'] loop
      if has_table_privilege(role_name,'private.'||tab,'SELECT,INSERT,UPDATE,DELETE') then raise exception 'Tabela privada concedida a %: %',role_name,tab; end if;
      if not (select relrowsecurity from pg_class where oid=('private.'||tab)::regclass) then raise exception 'Tabela sem RLS: %',tab; end if;
    end loop;
    if has_function_privilege(role_name,'private.prepare_account_deletions(uuid)','EXECUTE') or has_function_privilege(role_name,'private.finish_account_deletion(uuid)','EXECUTE') then raise exception 'Executor exposto'; end if;
  end loop;
end $$;
set constraints all immediate;
rollback;
