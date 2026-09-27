-- Preparado pelo harness: o prefixo sozinho não identifica uma fixture.
do $$ begin
  if exists(select from public.artist_profiles where profile_id='02000000-0000-4000-8000-000000000999')
    or exists(select from public.professional_details where profile_id='02000000-0000-4000-8000-000000000999') then
    raise exception 'Seed alterou perfil fora do conjunto sintético';
  end if;
end $$;
delete from public.profiles where id='02000000-0000-4000-8000-000000000999';
