-- Banco descartável; a transação não deixa contas, fatores nem coletivos.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void language plpgsql as $$
begin if value is distinct from true then raise exception '%', message; end if; end $$;
create function pg_temp.reject(statement text, expected_state text) returns void language plpgsql as $$
begin
  begin execute statement; exception when others then
    if sqlstate=expected_state then return; end if;
    raise exception 'Expected %, got %: %',expected_state,sqlstate,sqlerrm;
  end;
  raise exception 'Operation unexpectedly succeeded: %',statement;
end $$;
create function pg_temp.actor(n integer, mfa boolean default true) returns void language sql as $$
  select set_config('request.jwt.claims',jsonb_build_object('sub','70000000-0000-4000-8000-'||lpad(n::text,12,'0'),
    'role','authenticated','aal',case when mfa then 'aal2' else 'aal1' end,
    'session_id','72000000-0000-4000-8000-'||lpad(n::text,12,'0'))::text,true)::void
$$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.reject(text,text),pg_temp.actor(integer,boolean) to anon,authenticated;
insert into auth.users(id,email,email_confirmed_at,phone,phone_confirmed_at)
select ('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'collective-'||n||'@example.invalid',now(),'558199700000'||n,now() from generate_series(1,4) n;
insert into auth.mfa_factors(id,user_id,factor_type,status,created_at,updated_at)
select ('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'totp','verified',now(),now() from generate_series(1,4) n;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at)
select ('72000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('71000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'aal2',now(),now() from generate_series(1,4) n;
set local role authenticated;
do $$ declare n integer; begin
  for n in 1..4 loop
    perform pg_temp.actor(n);
    perform public.complete_registration(jsonb_build_object('name','Pessoa sintética '||n,'cpf',(array['52998224725','12345678909','11144477735','93541134780'])[n],
      'birth_date','1990-01-01','city','Recife','state_code','PE','phone_is_whatsapp',true),
      '{"kind":"artist","name":"Atuação sintética","styles":[{"style":"techno"}]}',gen_random_uuid());
  end loop;
end $$;
select pg_temp.actor(1);
select pg_temp.reject($q$select public.create_collective('{"kind":"producer","name":"Sem CNPJ","city":"Recife","state_code":"PE","description":"Sintético","activity":"Música"}',gen_random_uuid())$q$,'22023');
select set_config('test.c',public.create_collective('{"kind":"collective","name":"Coletivo sintético","city":"Recife","state_code":"PE","description":"Sintético","activity":"Música"}','73000000-0000-4000-8000-000000000001')::text,true);
select pg_temp.assert_true(public.create_collective('{"kind":"collective","name":"Coletivo sintético","city":"Recife","state_code":"PE","description":"Sintético","activity":"Música"}','73000000-0000-4000-8000-000000000001')=current_setting('test.c')::uuid,'Retry criou outro coletivo');
select pg_temp.assert_true((select count(*) from public.collectives)=0,'Pendente público');
select pg_temp.assert_true(public.get_collective_status(current_setting('test.c')::uuid)->>'state'='pending','Proprietário não acompanha pedido');
select pg_temp.reject($q$select public.save_collective_role(current_setting('test.c')::uuid,null,'Editor',array['create_events'])$q$,'42501');
select pg_temp.reject($q$select public.review_collective(current_setting('test.c')::uuid,1,'approved','Verificado manualmente')$q$,'42501');
select pg_temp.reject($q$select public.get_collective_review_contact(current_setting('test.c')::uuid)$q$,'42501');
select pg_temp.reject($q$select public.get_collective_review_queue()$q$,'42501');
reset role;
select pg_temp.assert_true((select count(*) from public.collectives)=1,'Criação parcial');
select pg_temp.assert_true((select count(*) from private.collective_memberships)=1,'Proprietário sem vínculo');
select pg_temp.reject($q$update public.collectives set kind='producer' where id=current_setting('test.c')::uuid$q$,'23503');
select pg_temp.reject($q$insert into private.collective_details(collective_id,kind,cnpj,request_id,request_hash) values(gen_random_uuid(),'producer',null,gen_random_uuid(),'test')$q$,'23514');
insert into private.site_admins(user_id) values('70000000-0000-4000-8000-000000000004');
set local role authenticated;
select pg_temp.actor(4,false);
select pg_temp.reject($q$select public.review_collective(current_setting('test.c')::uuid,1,'approved','Verificado')$q$,'42501');
select pg_temp.reject($q$select public.get_collective_review_queue()$q$,'42501');
select pg_temp.actor(4);
select pg_temp.assert_true((select count(*) from public.get_collective_review_queue())=1,'Admin não descobre pedido pendente');
select pg_temp.assert_true((select count(*) from public.get_collective_review_queue('pending',current_setting('test.c')::uuid))=0,'Cursor administrativo repete linha');
select pg_temp.assert_true(public.get_collective_review_contact(current_setting('test.c')::uuid)->>'phone'='+5581997000001','Contato de verificação ausente');
select pg_temp.assert_true(not (public.get_collective_review_contact(current_setting('test.c')::uuid)?|array['cpf','birth_date','email']),'Verificação expôs identidade excessiva');
select public.review_collective(current_setting('test.c')::uuid,1,'rejected','Referências insuficientes');
select pg_temp.actor(1);
select public.edit_collective(current_setting('test.c')::uuid,2,'{"description":"Corrigido sintético"}',true);
select pg_temp.actor(4);
select pg_temp.reject($q$select public.review_collective(current_setting('test.c')::uuid,2,'approved','Verificado')$q$,'40001');
select public.review_collective(current_setting('test.c')::uuid,3,'approved','Contato e referências verificados');
select pg_temp.reject($q$select public.review_collective(current_setting('test.c')::uuid,4,'approved','Repetido')$q$,'22023');
select pg_temp.assert_true((select count(*) from public.professional_details)=1,'Admin virou proprietário implicitamente');
select pg_temp.actor(1,false);
select pg_temp.assert_true((select count(*) from public.professional_details)=1,'Diretório liberado sem MFA');
select pg_temp.actor(1);
select pg_temp.assert_true((select count(*) from public.professional_details)=4,'Proprietário elegível não lê diretório');
select pg_temp.assert_true(public.get_collective_status(current_setting('test.c')::uuid)->'profile'->>'description'='Corrigido sintético','Proprietário não lê dados para edição');
select pg_temp.reject($q$select public.delete_collective_role(current_setting('test.c')::uuid,(public.get_collective_access(current_setting('test.c')::uuid)->>'role_id')::uuid)$q$,'22023');
select pg_temp.reject($q$select public.save_collective_role(current_setting('test.c')::uuid,(public.get_collective_access(current_setting('test.c')::uuid)->>'role_id')::uuid,'Membro',array['create_events'])$q$,'22023');
select set_config('test.unused_role',public.save_collective_role(current_setting('test.c')::uuid,null,'Descartável','{}')::text,true);
select public.delete_collective_role(current_setting('test.c')::uuid,current_setting('test.unused_role')::uuid);
select set_config('test.role',public.save_collective_role(current_setting('test.c')::uuid,null,'Operador',array['manage_requests','remove_members','create_events','edit_events','publish_events','cancel_events','read_messages','send_messages'])::text,true);
select pg_temp.reject($q$select public.save_collective_role(current_setting('test.c')::uuid,null,'Elevado',array['transfer_ownership'])$q$,'22023');
select pg_temp.actor(2);
select pg_temp.reject($q$select public.request_collective_membership(current_setting('test.c')::uuid,(select id from public.profiles where public.get_profile(id) is null limit 1),'Teste')$q$,'22023');
select pg_temp.reject($q$select public.request_collective_membership(current_setting('test.c')::uuid,null,repeat('x',2001))$q$,'22023');
select set_config('test.request',public.request_collective_membership(current_setting('test.c')::uuid)::text,true);
select pg_temp.assert_true(public.request_collective_membership(current_setting('test.c')::uuid)=current_setting('test.request')::uuid,'Pedido pendente duplicado');
select pg_temp.assert_true((select state from public.get_my_collective_requests() where id=current_setting('test.request')::uuid)='pending','Solicitante não acompanha próprio pedido');
select pg_temp.reject($q$select public.request_collective_membership(current_setting('test.c')::uuid,null,'Outro conteúdo')$q$,'22023');
select pg_temp.assert_true(public.get_collective_access(current_setting('test.c')::uuid) is null,'Pedido virou participação');
select pg_temp.reject($q$select public.get_collective_status(current_setting('test.c')::uuid)$q$,'42501');
select pg_temp.actor(1);
select pg_temp.assert_true((select count(*) from public.get_my_collective_requests())=0,'Consulta pessoal revelou pedido alheio');
select public.decide_collective_request(current_setting('test.request')::uuid,true);
select pg_temp.reject($q$select public.decide_collective_request(current_setting('test.request')::uuid,true)$q$,'22023');
select pg_temp.actor(2);
select pg_temp.assert_true((select state from public.get_my_collective_requests() where id=current_setting('test.request')::uuid)='approved','Solicitante não acompanha decisão');
select pg_temp.assert_true((select count(*) from public.get_my_collective_requests(current_setting('test.request')::uuid))=0,'Cursor pessoal repete linha');
select pg_temp.assert_true(public.get_collective_access(current_setting('test.c')::uuid)->'permissions'='[]'::jsonb,'Novo membro recebeu poderes');
select pg_temp.reject($q$select public.assign_collective_role(current_setting('test.c')::uuid,'70000000-0000-4000-8000-000000000002',current_setting('test.role')::uuid)$q$,'42501');
select pg_temp.actor(1);
select public.assign_collective_role(current_setting('test.c')::uuid,'70000000-0000-4000-8000-000000000002',current_setting('test.role')::uuid);
select pg_temp.reject($q$select public.delete_collective_role(current_setting('test.c')::uuid,current_setting('test.role')::uuid)$q$,'22023');
select pg_temp.assert_true((select count(*) from public.get_collective_roles(current_setting('test.c')::uuid))=2,'Perfis do proprietário indisponíveis');
select pg_temp.actor(2);
select pg_temp.assert_true((select count(*) from public.professional_details)=1,'Perfil com oito permissões lê diretório');
select pg_temp.reject($q$select public.transfer_collective_ownership(current_setting('test.c')::uuid,'70000000-0000-4000-8000-000000000002')$q$,'42501');
select pg_temp.reject($q$select public.remove_collective_member(current_setting('test.c')::uuid,'70000000-0000-4000-8000-000000000001')$q$,'42501');
select pg_temp.reject($q$select public.close_collective(current_setting('test.c')::uuid,'Encerrar')$q$,'42501');
select pg_temp.reject($q$select public.get_collective_member_activity(current_setting('test.c')::uuid)$q$,'42501');
select pg_temp.reject($q$select public.get_collective_roles(current_setting('test.c')::uuid)$q$,'42501');
select pg_temp.actor(3);
select set_config('test.request3',public.request_collective_membership(current_setting('test.c')::uuid)::text,true);
select public.cancel_collective_request(current_setting('test.request3')::uuid);
select set_config('test.request3',public.request_collective_membership(current_setting('test.c')::uuid)::text,true);
select pg_temp.actor(2);
select public.decide_collective_request(current_setting('test.request3')::uuid,true);
select pg_temp.actor(3);
select pg_temp.assert_true(public.get_collective_access(current_setting('test.c')::uuid)->'permissions'='[]'::jsonb,'Gestor atribuiu poderes ao admitir');
reset role;
update public.profiles set published=true where owner_id='70000000-0000-4000-8000-000000000003';
-- Fixar a preferência por DML do fixture testa apenas a projeção pública, não outra RPC já coberta em #116.
update private.account_details a set default_artist_profile_id=p.id from public.profiles p where p.owner_id=a.user_id and a.user_id='70000000-0000-4000-8000-000000000003';
set local role anon;
select set_config('request.jwt.claims','{}',true);
select pg_temp.assert_true((select count(*) from public.get_collective_members(current_setting('test.c')::uuid) where artist_profile_id is not null)=1,'Perfil padrão público ausente');
reset role;
update public.profiles set published=false where owner_id='70000000-0000-4000-8000-000000000003';
set local role anon;
select pg_temp.assert_true((select count(*) from public.get_collective_members(current_setting('test.c')::uuid) where artist_profile_id is not null)=0,'Perfil padrão privado exposto');
set local role authenticated;
select pg_temp.actor(3);
select set_config('test.other',public.create_collective('{"kind":"collective","name":"Outro","city":"Recife","state_code":"PE","description":"Outro sintético","activity":"Música"}',gen_random_uuid())::text,true);
select pg_temp.actor(4);
select public.review_collective(current_setting('test.other')::uuid,1,'approved','Verificado manualmente');
select pg_temp.actor(3);
select pg_temp.reject($q$select public.assign_collective_role(current_setting('test.other')::uuid,'70000000-0000-4000-8000-000000000003',current_setting('test.role')::uuid)$q$,'22023');
select pg_temp.actor(1);
select pg_temp.reject($q$select public.remove_collective_member(current_setting('test.c')::uuid,'70000000-0000-4000-8000-000000000001')$q$,'42501');
select pg_temp.actor(1,false);
select pg_temp.reject($q$select public.transfer_collective_ownership(current_setting('test.c')::uuid,'70000000-0000-4000-8000-000000000002')$q$,'42501');
reset role;
update auth.mfa_factors set status='unverified' where user_id='70000000-0000-4000-8000-000000000002';
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.reject($q$select public.transfer_collective_ownership(current_setting('test.c')::uuid,'70000000-0000-4000-8000-000000000002')$q$,'42501');
reset role;
update auth.mfa_factors set status='verified' where user_id='70000000-0000-4000-8000-000000000002';
-- Sucessor não precisa manter sessão simultânea; fator concluído é consultado no Auth.
delete from auth.sessions where user_id='70000000-0000-4000-8000-000000000002';
set local role authenticated;
select public.transfer_collective_ownership(current_setting('test.c')::uuid,'70000000-0000-4000-8000-000000000002');
select pg_temp.assert_true(public.get_collective_access(current_setting('test.c')::uuid)->'permissions'='[]'::jsonb,'Ex-proprietário reteve poderes');
select pg_temp.assert_true((select count(*) from public.professional_details)=1,'Ex-proprietário reteve diretório');
select pg_temp.actor(2);
select pg_temp.assert_true((select count(*) from public.professional_details)=1,'Sessão revogada continua elegível');
reset role;
insert into auth.sessions(id,user_id,factor_id,aal,created_at,updated_at) values('72000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000002','aal2',now(),now());
select pg_temp.reject($q$delete from auth.users where id='70000000-0000-4000-8000-000000000002'$q$,'23514');
select pg_temp.reject($q$update public.collectives set owner_user_id=null where id=current_setting('test.c')::uuid$q$,'23514');
select pg_temp.reject($q$insert into private.collective_role_permissions(collective_id,role_id,permission) select id,member_role_id,'send_messages' from public.collectives where id=current_setting('test.c')::uuid$q$,'23503');
select pg_temp.assert_true(not has_table_privilege('authenticated','private.collective_memberships','SELECT,INSERT,UPDATE,DELETE'),'Vínculos privados expostos');
select pg_temp.assert_true(not has_column_privilege('anon','public.collectives','owner_user_id','SELECT'),'UUID pessoal público');
set local role authenticated;
select pg_temp.actor(2);
select pg_temp.assert_true((select count(*) from public.professional_details)=4,'Novo proprietário inelegível');
select public.assign_collective_role(current_setting('test.c')::uuid,'70000000-0000-4000-8000-000000000001',current_setting('test.role')::uuid);
select pg_temp.actor(4);
select public.review_collective(current_setting('test.c')::uuid,5,'suspended','Revisão por abuso');
select pg_temp.actor(2);
select pg_temp.assert_true((select count(*) from public.professional_details)=1,'Suspensão não revogou diretório');
select pg_temp.assert_true(private.collective_can(current_setting('test.c')::uuid,'read_messages',true),'Suspenso perdeu histórico autorizado');
select pg_temp.assert_true(not private.collective_can(current_setting('test.c')::uuid,'send_messages'),'Suspenso envia mensagem');
select pg_temp.reject($q$select public.save_collective_role(current_setting('test.c')::uuid,null,'Teste',array['create_events'])$q$,'42501');
select pg_temp.assert_true(public.get_collective_access(current_setting('test.c')::uuid) is null,'Suspenso abre dashboard');
select pg_temp.actor(3);
select pg_temp.assert_true((select count(*) from public.professional_details)=4,'Outro vínculo proprietário elegível foi indevidamente revogado');
reset role;
update private.account_details set state='suspended' where user_id='70000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.actor(1);
select pg_temp.assert_true(not private.collective_can(current_setting('test.c')::uuid,'read_messages',true),'Conta suspensa lê histórico');
select pg_temp.assert_true((select count(*) from public.collectives)=0,'Conta suspensa consulta catálogo');
select pg_temp.assert_true((select count(*) from public.professional_details)=0,'Conta suspensa lê material');
reset role;
update private.account_details set state='active' where user_id='70000000-0000-4000-8000-000000000001';
set local role authenticated;
select pg_temp.actor(4);
select public.review_collective(current_setting('test.c')::uuid,6,'approved','Revisão encerrada');
select pg_temp.actor(2);
select public.close_collective(current_setting('test.c')::uuid,'Encerrado pelo titular');
select pg_temp.reject($q$select public.get_collective_status(current_setting('test.c')::uuid)$q$,'42501');
select pg_temp.assert_true(not private.collective_can(current_setting('test.c')::uuid,'read_messages',true),'Encerrado mantém acesso ao histórico');
reset role;
delete from auth.users where id='70000000-0000-4000-8000-000000000002';
select pg_temp.assert_true(exists(select from public.collectives where id=current_setting('test.c')::uuid),'Exclusão pessoal apagou coletivo compartilhado');
update private.account_details set state='suspended' where user_id='70000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.actor(3);
select pg_temp.reject($q$select public.close_collective(current_setting('test.other')::uuid,'Encerrar')$q$,'42501');
select pg_temp.actor(4);
select public.support_close_collective(current_setting('test.other')::uuid,'Pedido verificado pelo suporte');
reset role;
delete from auth.users where id='70000000-0000-4000-8000-000000000003';
set local role anon;
select pg_temp.assert_true((select count(*) from public.collectives)=0,'Encerrado público');
select pg_temp.reject($q$select public.create_collective('{}',gen_random_uuid())$q$,'42501');
reset role;
set constraints all immediate;
rollback;
