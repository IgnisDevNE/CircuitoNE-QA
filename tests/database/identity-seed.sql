-- Após duas aplicações do seed; sem resetar nenhum projeto compartilhado.
do $$ begin
  if (select count(*) from private.account_details where user_id::text like '01000000-%') <> 3
    or (select count(*) from public.profiles where id::text like '02000000-%') <> 6 then
    raise exception 'Seeds de identidade incompletos ou duplicados';
  end if;
  if (select count(distinct state) from private.account_details where user_id::text like '01000000-%') <> 3
    or (select count(distinct kind) from public.profiles where id::text like '02000000-%') <> 4 then
    raise exception 'Seeds não cobrem todos os estados e atuações';
  end if;
  if exists(select from auth.users where id::text like '01000000-%' and (email not like '%@example.invalid' or encrypted_password is not null)) then
    raise exception 'Seed contém identidade não sintética ou senha utilizável';
  end if;
end $$;
