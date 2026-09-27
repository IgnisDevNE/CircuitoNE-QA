begin;
do $$ begin
  if (select count(*) from public.events where id::text like '0a000000-%')<>8 then raise exception 'Eventos sintéticos incompletos/duplicados'; end if;
  if (select count(distinct state) from public.events where id::text like '0a000000-%')<>3 then raise exception 'Estados de evento incompletos'; end if;
  if (select count(distinct private.event_period(starts_at,ends_at,'2026-09-26T12:00Z')) from public.events where id::text like '0a000000-%')<>3 then raise exception 'Períodos sintéticos incompletos'; end if;
  if not exists(select from public.events where id::text like '0a000000-%' and rescheduled_at is not null) then raise exception 'Reagendamento ausente'; end if;
  if not exists(select from public.events where id::text like '0a000000-%' and not is_free and ticket_url='https://tickets.example.invalid/fixture') then raise exception 'Ingresso externo ausente'; end if;
  if not exists(select from private.event_lineup where event_id::text like '0a000000-%' and artist_id is null and credited_name='Crédito sintético sem vínculo') then raise exception 'Crédito histórico sem vínculo ausente'; end if;
  if (select count(*) from private.event_details where event_id::text like '0a000000-%')<>8 then raise exception 'Detalhes sintéticos incompletos'; end if;
end $$;
set local role anon;
select set_config('request.jwt.claims','{}',true);
do $$ begin
  if (select count(*) from public.events where id::text like '0a000000-%')<>5 then raise exception 'Seed expõe rascunho/cancelado/coletivo suspenso'; end if;
end $$;
rollback;
