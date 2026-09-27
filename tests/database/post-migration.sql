-- Somente banco descartável. Executado após aplicar todas as migrações canônicas.
do $test$
begin
  if current_setting('server_version_num')::int / 10000 <> 17 then
    raise exception 'Esperado Postgres 17';
  end if;
  if to_regclass('auth.sessions') is null or not exists (
    select from information_schema.columns where table_schema='auth' and table_name='users' and column_name='phone_confirmed_at'
  ) then
    raise exception 'Migrações oficiais do Auth ausentes';
  end if;
  if (select count(*) from public.phase0_pipeline_probe) <> 1 then
    raise exception 'Migração de ensaio não foi aplicada exatamente uma vez';
  end if;
  if has_table_privilege('anon', 'public.phase0_pipeline_probe', 'SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('authenticated', 'public.phase0_pipeline_probe', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'Ensaio expôs privilégios de tabela sem autorização prevista';
  end if;
  if exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity
      and not exists (select 1 from pg_depend d where d.classid = 'pg_class'::regclass
        and d.objid = c.oid and d.deptype = 'e')
  ) then
    raise exception 'Tabela pública sem RLS após migrações';
  end if;
  begin
    insert into public.phase0_pipeline_probe values (0);
    raise exception 'Constraint de ensaio não bloqueou dado inválido';
  exception when check_violation then
    null;
  end;
end $test$;
