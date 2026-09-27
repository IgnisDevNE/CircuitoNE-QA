do $$ begin
  if (select count(*) from private.conversations where id between '0d000000-0000-4000-8000-000000000001' and '0d000000-0000-4000-8000-000000000006')<>6 then raise exception 'Seeds de mensagens incompletos'; end if;
  if (select count(*) from private.message_reports where id in('0f000000-0000-4000-8000-000000000001','0f000000-0000-4000-8000-000000000002'))<>2 then raise exception 'Seeds de denúncias incompletos'; end if;
  if not exists(select from private.account_deletions where user_id='01000000-0000-4000-8000-000000000003' and prepared_at is null) then raise exception 'Seed de exclusão ausente'; end if;
end $$;
begin;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"01000000-0000-4000-8000-000000000005","role":"authenticated"}',true);
do $$ begin
  if jsonb_array_length(public.list_conversations())<>6 then raise exception 'Membro não consulta seus históricos'; end if;
  if public.get_messages('0d000000-0000-4000-8000-000000000006')->0->>'sender_name'<>'Conta excluída' then raise exception 'Fixture excluída identificável'; end if;
end $$;
rollback;
