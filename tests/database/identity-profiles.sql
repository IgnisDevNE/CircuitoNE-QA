-- Somente banco descartável, com migrações Auth do CLI. Tudo é revertido.
begin;
create function pg_temp.assert_true(value boolean, message text) returns void
language plpgsql as $$ begin if value is distinct from true then raise exception '%', message; end if; end $$;
create function pg_temp.reject(statement text, expected_state text) returns void
language plpgsql as $$ begin
  begin execute statement; exception when others then
    if sqlstate = expected_state then return; end if;
    raise exception 'Expected SQLSTATE %, got %: %', expected_state, sqlstate, sqlerrm;
  end;
  raise exception 'Operation unexpectedly succeeded: %', statement;
end $$;
grant execute on function pg_temp.assert_true(boolean,text),pg_temp.reject(text,text) to anon,authenticated;

select pg_temp.assert_true(private.valid_cpf('52998224725'), 'CPF válido rejeitado');
select pg_temp.assert_true(not private.valid_cpf('11111111111'), 'CPF repetido aceito');
select pg_temp.assert_true(not private.valid_cpf('52998224724'), 'Dígito inválido aceito');
select pg_temp.assert_true(not private.valid_cpf('529.982.247-25'), 'Persistência aceita CPF não normalizado');
select pg_temp.assert_true(not has_table_privilege('authenticated', 'private.account_details', 'SELECT,INSERT,UPDATE,DELETE'), 'Conta privada exposta');
select pg_temp.assert_true(not has_function_privilege('anon', 'public.complete_registration(jsonb,jsonb,uuid)', 'EXECUTE'), 'Cadastro anônimo exposto');

-- Payload sintético comum; a identidade sempre vem do JWT e do Auth real.
create function pg_temp.register(cpf text, kind text, birthday date default '1990-01-01', styles jsonb default '[{"style":"techno"}]', request_id uuid default '10000000-0000-4000-8000-000000000001') returns uuid
language sql as $$ select public.complete_registration(
  jsonb_build_object('name','Pessoa sintética','cpf',cpf,'birth_date',birthday,'city','Recife','state_code','PE','phone_is_whatsapp',true),
  jsonb_build_object('kind',kind,'name','Atuação sintética','styles',case when kind='artist' then styles else '[]'::jsonb end), request_id) $$;
grant execute on function pg_temp.register(text,text,date,jsonb,uuid) to authenticated;

insert into auth.users(id, email, email_confirmed_at, phone, phone_confirmed_at)
values ('00000000-0000-4000-8000-000000000001', 'identity-1@example.invalid', now(), '5581990000001', now()),
       ('00000000-0000-4000-8000-000000000002', 'identity-2@example.invalid', now(), '5581990000002', now()),
       ('00000000-0000-4000-8000-000000000003', 'identity-3@example.invalid', null, '5581990000003', null);

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.reject($q$select pg_temp.register('52998224725','artist')$q$, '42501');
reset role;
update auth.users set email_confirmed_at=now() where id='00000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.reject($q$select pg_temp.register('52998224725','artist')$q$, '42501');
reset role;
update auth.users set email_confirmed_at=null,phone_confirmed_at=now() where id='00000000-0000-4000-8000-000000000003';
set local role authenticated;
select pg_temp.reject($q$select pg_temp.register('52998224725','artist')$q$, '42501');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
-- Data tipada, idade limite em America/Fortaleza verificada pelo servidor.
select pg_temp.reject($q$select pg_temp.register('52998224725','artist', (current_date - interval '17 years')::date)$q$, '22023');
select pg_temp.reject($q$select pg_temp.register('52998224725','artist','-infinity')$q$, '22023');
select pg_temp.reject($q$select pg_temp.register('52998224725','artist','infinity')$q$, '22023');
select pg_temp.reject($q$select pg_temp.register('52998224725','artist','1990-01-01','[]')$q$, '22023');
select pg_temp.reject($q$select pg_temp.register('52998224725','artist','1990-01-01','[{"style":"techno","substyle":"samba"}]')$q$, '22023');
select pg_temp.assert_true((select count(*) from public.profiles)=0, 'Cadastro inválido deixou perfil parcial');
select pg_temp.register('529.982.247-25','artist');
select pg_temp.register('529.982.247-25','artist');
select pg_temp.reject($q$select pg_temp.register('12345678909','artist')$q$, '22023');
select pg_temp.reject($q$select pg_temp.register('529.982.247-25','artist','1990-01-01','[{"style":"techno"}]','10000000-0000-4000-8000-000000000002')$q$, '22023');
select pg_temp.assert_true((select count(*) from public.profiles) = 1, 'Catálogo do titular ausente');
select pg_temp.reject($q$update public.profiles set owner_id = '00000000-0000-4000-8000-000000000002'$q$, '42501');
select pg_temp.reject($q$select cpf from private.account_details$q$, '42501');
select pg_temp.reject($q$select public.set_default_artist('ffffffff-ffff-4fff-8fff-ffffffffffff')$q$, '42501');
select public.set_default_artist((select id from public.profiles limit 1));

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.reject($q$select pg_temp.register('52998224725','services')$q$, '22023');
select pg_temp.register('12345678909','services');
select pg_temp.assert_true((select count(*) from public.profiles) = 2, 'Catálogo autenticado incompleto');
select pg_temp.reject('select social_links from public.profiles','42501');
select pg_temp.assert_true(public.get_profile((select id from public.profiles where kind='artist')) is null, 'Perfil alheio não publicado excede projeção interna');
select pg_temp.assert_true((select count(*) from public.artist_styles)=0, 'Classificação de rascunho alheio exposta');
select pg_temp.assert_true((select count(*) from public.professional_details) = 1, 'Material de terceiro exposto');
select pg_temp.reject($q$select public.set_default_artist((select id from public.profiles where kind='artist' limit 1))$q$, '42501');

reset role;
-- Impossível falsificar subtipo ou violar cota mesmo via DML privilegiado.
select pg_temp.reject($q$update public.profiles set state_code='XX'$q$,'23514');
select pg_temp.reject($q$insert into public.artist_profiles(profile_id) select id from public.profiles where kind='services'$q$, '23503');
select pg_temp.reject($q$update public.professional_details set portfolio_url='https://example.invalid' where kind='services'$q$, '23514');
select pg_temp.reject($q$update public.professional_details set service_other='Outro' where kind='services'$q$, '23514');
select pg_temp.reject($q$update public.professional_details set presskit_path=profile_id::text || '/kit.pdf' where kind='artist'$q$, '23514');
select pg_temp.reject($q$update public.professional_details set services_pdf_path=profile_id::text || '/list.pdf' where kind='services'$q$, '23514');
update public.professional_details set presskit_path=profile_id::text || '/kit.pdf',presskit_bytes=10000000 where kind='artist';
select pg_temp.reject($q$update public.professional_details set presskit_bytes=10000001 where kind='artist'$q$, '23514');
select pg_temp.reject($q$update public.professional_details set presskit_url='https://example.invalid', presskit_path='private/test.pdf' where kind='artist'$q$, '23514');
select pg_temp.reject($q$insert into public.profile_images(profile_id, position, object_path, mime_type, size_bytes) select id, 11, id::text || '/image.png', 'image/png', 1 from public.profiles where kind='artist'$q$, '23514');
select pg_temp.reject($q$insert into public.profile_images(profile_id, position, object_path, mime_type, size_bytes) select id, 1, id::text || '/image.png', 'image/png', 5000001 from public.profiles where kind='artist'$q$, '23514');
select pg_temp.reject($q$insert into public.profile_images(profile_id, position, object_path, mime_type, size_bytes) select id, 1, id::text || '/image.png', 'image/svg+xml', 1 from public.profiles where kind='artist'$q$, '23514');
insert into public.profile_images(profile_id,position,object_path,mime_type,size_bytes)
  select id,position,id::text || '/image-' || position || '.png','image/png',5000000 from public.profiles cross join generate_series(0,10) position where kind='artist';
select pg_temp.reject($q$insert into public.profile_images(profile_id,position,object_path,mime_type,size_bytes) select id,10,id::text || '/duplicate.png','image/png',1 from public.profiles where kind='artist'$q$, '23505');

-- Exatamente 18 anos, telefone ausente/não confirmado e metadados forjados.
update auth.users set email_confirmed_at=now(),phone_confirmed_at=now(),raw_user_meta_data='{"role":"admin","state":"active"}' where id='00000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select pg_temp.reject($q$select pg_temp.register('11144477735','member', (((now() at time zone 'America/Fortaleza')::date - interval '18 years')::date + 1))$q$, '22023');
select pg_temp.register('11144477735','member',((now() at time zone 'America/Fortaleza')::date - interval '18 years')::date);
select pg_temp.assert_true((select count(*) from public.professional_details)=0,'Metadado do usuário elevou acesso');
reset role;
select pg_temp.reject($q$update auth.users set phone='5581990000001' where id='00000000-0000-4000-8000-000000000003'$q$,'23505');

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select pg_temp.assert_true((select count(*) from public.profiles) = 0, 'Perfil não publicado exposto anonimamente');
select pg_temp.assert_true((select count(*) from public.professional_details) = 0, 'Materiais expostos anonimamente');
select pg_temp.reject('select owner_id from public.profiles', '42501');
reset role;
update public.profiles set published=true where kind='artist';
set local role anon;
select pg_temp.assert_true((select count(*) from public.profiles) = 1, 'Artista público ausente');
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select pg_temp.assert_true(public.create_profile('{"kind":"artist","name":"Segundo projeto","styles":[{"style":"techno"}]}') <> public.create_profile('{"kind":"artist","name":"Terceiro projeto","styles":[{"style":"techno","substyle":"acid techno"}]}'), 'Múltiplos projetos bloqueados');
select pg_temp.reject($q$select public.create_profile('{"kind":"artist","name":"Forjado","owner_id":"00000000-0000-4000-8000-000000000001","styles":[{"style":"techno"}]}')$q$,'22023');
select pg_temp.reject($q$select public.create_profile('{"kind":"artist","name":"Duplicado","styles":[{"style":"techno"},{"style":"techno"}]}')$q$,'22023');
reset role;
update private.account_details set state='suspended' where user_id='00000000-0000-4000-8000-000000000001';
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select pg_temp.assert_true((select count(*) from public.profiles) = 0, 'Conta suspensa ainda consulta catálogo');
select pg_temp.reject($q$select public.create_profile('{"kind":"services","name":"Não permitido"}')$q$, '42501');
reset role;
rollback;
