-- Assertions somente: seguro antes dos seeds no runner canônico e em banco compartilhado.
begin read only;
do $$ begin
  if exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname in ('public','private') and c.relkind in ('r','p') and not c.relrowsecurity
    and not exists(select from pg_depend d where d.classid='pg_class'::regclass and d.objid=c.oid and d.deptype='e')) then
    raise exception 'Tabela da aplicação sem RLS'; end if;
  if exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join (values('anon'),('authenticated')) roles(name)
    where n.nspname='private' and c.relkind in ('r','p','v','m','f') and
    (has_table_privilege(roles.name,c.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or
     has_any_column_privilege(roles.name,c.oid,'SELECT,INSERT,UPDATE,REFERENCES'))) then
    raise exception 'Dados privados com grant direto'; end if;
  if exists(select from pg_class c join pg_namespace n on n.oid=c.relnamespace
    cross join (values('anon'),('authenticated')) roles(name)
    where n.nspname='public' and c.relkind in ('r','p') and
    (has_table_privilege(roles.name,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') or
     has_any_column_privilege(roles.name,c.oid,'INSERT,UPDATE,REFERENCES'))) then
    raise exception 'Escrita direta pela Data API'; end if;
  if exists(select from pg_constraint c join pg_namespace n on n.oid=c.connamespace
    where n.nspname in ('public','private') and not c.convalidated) then raise exception 'Constraint não validada'; end if;
  if exists(select from public.collectives c join private.collective_roles r on r.id=c.member_role_id
    where r.collective_id<>c.id or not r.builtin or exists(select from private.collective_role_permissions p where p.role_id=r.id)) then
    raise exception 'Perfil Membro inválido'; end if;
  if exists(select from private.messages m join private.conversations c on c.id=m.conversation_id
    where m.sender_identity_id not in(c.side_a,c.side_b)) or
    exists(select from private.conversation_blocks b join private.conversations c on c.id=b.conversation_id
    where b.identity_id not in(c.side_a,c.side_b)) then raise exception 'Interlocutor estranho à conversa'; end if;
  if exists(select from private.message_identities i join public.profiles p on p.id=i.profile_id
    where i.owner_user_id is distinct from p.owner_id) then raise exception 'Identidade de mensagem sem titular'; end if;
  if exists(select from private.message_reports r where r.closed_at is not null and
    (r.source_message_id is not null or r.reporter_user_id is not null or
     exists(select from private.report_context c where c.report_id=r.id and c.author_user_id is not null))) then
    raise exception 'Denúncia encerrada ainda identificável'; end if;
  if exists(select from private.message_reports r where
    (select count(*) from private.report_context c where c.report_id=r.id and c.selected)<>1) then
    raise exception 'Contexto de denúncia sem mensagem selecionada'; end if;
  if exists(select from private.account_deletions d where d.prepared_at is not null and
    (exists(select from private.account_details a where a.user_id=d.user_id) or
     exists(select from public.profiles p where p.owner_id=d.user_id) or
     exists(select from private.messages m where m.author_user_id=d.user_id))) or
    exists(select from private.account_deletions d where d.prepared_at is null and
    not exists(select from private.account_details a where a.user_id=d.user_id and a.state='deletion_pending')) then
    raise exception 'Preparação da exclusão inconsistente'; end if;

  -- O runner canônico inicial roda sem esse alvo. Homologação exige fixtures presentes;
  -- não confundir ausência de dados com sucesso nem sobrescrever alterações do testador.
  if current_setting('circuitone.seed_target',true)='odphoxozclrshqjgwbqk' then
    if not exists(select from public.profiles where id='02000000-0000-4000-8000-000000000008'
      and owner_id='01000000-0000-4000-8000-000000000005' and kind='artist') or
      (select count(*) from auth.users where id in
      (select ('01000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,5)n))<>5 or
      (select count(distinct kind) from public.profiles where id in
      (select ('02000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,7)n))<>4 or
      (select count(distinct state) from public.collectives where id in
      (select ('05000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6)n))<>5 or
      (select count(*) from public.events where id in
      (select ('0a000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,8)n))<>8 or
      (select count(*) from private.conversations where id in
      (select ('0d000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid from generate_series(1,6)n))<>6 then
      raise exception 'Fixtures de homologação incompletas'; end if;
  end if;
end $$;
rollback;
