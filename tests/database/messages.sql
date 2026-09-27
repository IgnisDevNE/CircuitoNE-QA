begin;
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%',message; end if; end $$;
create function pg_temp.reject(statement text,expected_state text) returns void language plpgsql as $$
begin begin execute statement; exception when others then
  if sqlstate=expected_state then return; end if;
  raise exception 'Expected %, got %: %',expected_state,sqlstate,sqlerrm;
end; raise exception 'Operation unexpectedly succeeded'; end $$;
create function pg_temp.actor(n integer) returns void language sql as $$
 select set_config('request.jwt.claims',jsonb_build_object('sub','91000000-0000-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::void
$$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.reject(text,text),pg_temp.actor(integer) to anon,authenticated;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
select ('91000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'message-'||n||'@example.invalid',now(),'558191000000'||n,now() from generate_series(1,4) n;
insert into private.account_details(user_id,name,cpf,birth_date,city,state_code,phone_is_whatsapp,registration_request_id,registration_hash)
select ('91000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Nome cadastral privado '||n,(array['52998224725','12345678909','11144477735','93541134780'])[n],
  '1990-01-01','Recife','PE',true,gen_random_uuid(),'messages-test' from generate_series(1,4) n;
insert into public.profiles(id,owner_id,kind,name,city,state_code)
select ('92000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('91000000-0000-4000-8000-'||lpad((array[1,2,2,3])[n]::text,12,'0'))::uuid,
  'member','Atuação sintética '||n,'Recife','PE' from generate_series(1,4) n;
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.reject($q$select public.send_message('profile','92000000-0000-4000-8000-000000000002','profile','92000000-0000-4000-8000-000000000001','Invasão',gen_random_uuid())$q$,'42501');
select pg_temp.reject($q$select public.send_message('profile','92000000-0000-4000-8000-000000000001','profile','92000000-0000-4000-8000-000000000002',' ',gen_random_uuid())$q$,'22023');
select pg_temp.reject($q$select public.send_message('profile','92000000-0000-4000-8000-000000000001','profile','92000000-0000-4000-8000-000000000002',repeat('a',2001),gen_random_uuid())$q$,'22023');
select set_config('test.sent',public.send_message('profile','92000000-0000-4000-8000-000000000001','profile','92000000-0000-4000-8000-000000000002','Olá 👋','93000000-0000-4000-8000-000000000001')::text,true);
select set_config('test.conversation',current_setting('test.sent')::jsonb->>'conversation_id',true);
select set_config('test.message',current_setting('test.sent')::jsonb->>'message_id',true);
select pg_temp.assert_true(public.send_message('profile','92000000-0000-4000-8000-000000000001','profile','92000000-0000-4000-8000-000000000002','Olá 👋','93000000-0000-4000-8000-000000000001')=current_setting('test.sent')::jsonb,'Retry duplicou envio');
select pg_temp.reject($q$select public.send_message('profile','92000000-0000-4000-8000-000000000001','profile','92000000-0000-4000-8000-000000000002','Alterado','93000000-0000-4000-8000-000000000001')$q$,'22023');
select pg_temp.assert_true(public.send_message('profile','92000000-0000-4000-8000-000000000001','profile','92000000-0000-4000-8000-000000000002','Segundo',gen_random_uuid())->>'conversation_id'=current_setting('test.conversation'),'Par gerou conversa duplicada');
select pg_temp.assert_true(public.send_message('profile','92000000-0000-4000-8000-000000000001','profile','92000000-0000-4000-8000-000000000003','Outro projeto',gen_random_uuid())->>'conversation_id'<>current_setting('test.conversation'),'Projetos irmãos foram misturados');
select pg_temp.actor(4);
select pg_temp.assert_true(public.list_conversations()='[]'::jsonb,'Terceiro listou conversas');
select pg_temp.assert_true(public.get_messages(current_setting('test.conversation')::uuid)='[]'::jsonb,'Terceiro leu mensagem');
select pg_temp.reject($q$select public.mark_conversation_read(current_setting('test.conversation')::uuid,current_setting('test.message')::uuid)$q$,'42501');
select pg_temp.actor(2);
select pg_temp.assert_true(jsonb_array_length(public.get_messages(current_setting('test.conversation')::uuid))=2,'Destinatário não lê sua conversa');
select pg_temp.assert_true(public.get_messages(current_setting('test.conversation')::uuid)->0->>'sender_name'='Atuação sintética 1','Mensagem expôs nome cadastral ou perdeu atuação');
select public.mark_conversation_read(current_setting('test.conversation')::uuid,current_setting('test.message')::uuid);
select public.set_conversation_block(current_setting('test.conversation')::uuid,'profile','92000000-0000-4000-8000-000000000002',true);
select pg_temp.reject($q$select public.send_message('profile','92000000-0000-4000-8000-000000000002','profile','92000000-0000-4000-8000-000000000001','Bloqueado',gen_random_uuid())$q$,'42501');
select pg_temp.actor(1);
select pg_temp.reject($q$select public.set_conversation_block(current_setting('test.conversation')::uuid,'profile','92000000-0000-4000-8000-000000000002',false)$q$,'42501');
select pg_temp.reject($q$select public.send_message('profile','92000000-0000-4000-8000-000000000001','profile','92000000-0000-4000-8000-000000000002','Bloqueado',gen_random_uuid())$q$,'42501');
select pg_temp.actor(2);
select public.set_conversation_block(current_setting('test.conversation')::uuid,'profile','92000000-0000-4000-8000-000000000002',false);
select pg_temp.assert_true(public.send_message('profile','92000000-0000-4000-8000-000000000002','profile','92000000-0000-4000-8000-000000000001','Voltou',gen_random_uuid())->>'conversation_id'=current_setting('test.conversation'),'Resposta criou outro par');
select public.delete_profile('92000000-0000-4000-8000-000000000002');
select pg_temp.actor(1);
select pg_temp.assert_true(public.get_messages(current_setting('test.conversation')::uuid)->2->>'sender_name'='Atuação excluída','Atuação excluída mantém identidade pública');
select pg_temp.reject($q$select public.send_message('profile','92000000-0000-4000-8000-000000000001','profile','92000000-0000-4000-8000-000000000002','Após exclusão',gen_random_uuid())$q$,'42501');
select pg_temp.actor(2);
select pg_temp.assert_true(jsonb_array_length(public.get_messages(current_setting('test.conversation')::uuid))=3,'Titular perdeu histórico da atuação excluída');
reset role;
delete from auth.users where id='91000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true(public.get_messages(current_setting('test.conversation')::uuid)->2->>'sender_name'='Conta excluída','Conta excluída mantém identificação');
select pg_temp.assert_true(public.get_messages(current_setting('test.conversation')::uuid)->2->>'sender_id' is null,'Conta excluída expõe vínculo');
select pg_temp.actor(2);
select pg_temp.assert_true(public.get_messages(current_setting('test.conversation')::uuid)='[]'::jsonb,'JWT antigo leu histórico após exclusão');
reset role;
set constraints all immediate;
rollback;
