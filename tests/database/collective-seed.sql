do $$ begin
  if (select count(*) from public.collectives where id::text like '05000000-%')<>6 then raise exception 'Coletivos sintéticos incompletos/duplicados'; end if;
  if (select count(distinct state) from public.collectives where id::text like '05000000-%')<>5 then raise exception 'Estados de coletivo incompletos'; end if;
  if (select count(distinct permission) from private.collective_role_permissions where collective_id::text like '05000000-%')<>8 then raise exception 'Permissões sintéticas incompletas'; end if;
  if (select count(distinct state) from private.membership_requests where collective_id::text like '05000000-%')<>4 then raise exception 'Estados de pedido incompletos'; end if;
  if not exists(select from public.collectives c join private.collective_details d on d.collective_id=c.id where c.kind='producer' and d.cnpj is not null) then raise exception 'Produtora sintética ausente'; end if;
  if exists(select from auth.users where id='01000000-0000-4000-8000-000000000005' and coalesce(encrypted_password,'')<>'') then raise exception 'Seed criou login utilizável'; end if;
end $$;
