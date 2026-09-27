import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { setTimeout } from 'node:timers/promises'

export async function checkMessageConcurrency(query, queryAsync) {
  const actor="'70000000-0000-4000-8000-000000000001'"
  const source="'78000000-0000-4000-8000-000000000001'"
  const target="'78000000-0000-4000-8000-000000000002'"
  const send=`begin; set local application_name='message-race-send'; set local role authenticated;
    select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
    select public.send_message('profile',${source},'profile',${target},'Corrida sintética',gen_random_uuid());
    reset role; insert into private.message_test_order(action) values('send'); commit;`
  for(const first of ['send','delete']) {
    query(readFileSync('tests/database/collective-concurrency.sql','utf8'))
    query(`insert into public.profiles(id,owner_id,kind,name,city,state_code) values
      (${source},${actor},'member','Remetente sintético','Recife','PE'),
      (${target},'70000000-0000-4000-8000-000000000002','member','Destino sintético','Recife','PE');
      select private.message_identity('profile',${source}); select private.message_identity('profile',${target});
      begin; set local role authenticated;
      select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
      select public.send_message('profile',${source},'profile',${target},'Conversa existente',gen_random_uuid()); commit;
      create table private.message_test_order(id bigint generated always as identity,action text);
      create function private.message_test_pause() returns trigger language plpgsql as $$ begin perform pg_sleep(2); return new; end $$;
      create trigger message_test_pause before insert on private.messages for each row execute function private.message_test_pause();`)
    // Mesmo retry em duas conexões conserva uma mensagem e uma conversa.
    query('alter table private.messages disable trigger message_test_pause')
    const retry=send.replace('gen_random_uuid()',"'79000000-0000-4000-8000-000000000001'")
    await Promise.all([queryAsync(retry),queryAsync(retry)])
    assert.match(query("select count(*) from private.messages where author_user_id="+actor), /\b2\b/)
    query('truncate private.message_test_order; alter table private.messages enable trigger message_test_pause')
    const remove=`begin; delete from public.profiles where id=${target}; insert into private.message_test_order(action) values('delete'); commit;`
    if(first==='send') {
      const sending=queryAsync(send)
      // Sincroniza no ponto crítico, sem depender de uma pausa arbitrária do executor.
      const deadline=Date.now()+10000
      while(!query("select case when exists(select from pg_stat_activity where application_name='message-race-send' and wait_event='PgSleep') then 'READY' else 'WAIT' end").includes('READY')) {
        assert.ok(Date.now()<deadline,'Envio não chegou ao ponto de disputa')
        await setTimeout(20)
      }
      await Promise.all([sending,queryAsync(remove)])
      assert.match(query("select string_agg(action,',' order by id) from private.message_test_order"),/send,delete/,'Exclusão confirmou antes de um envio que ainda concluiu')
    } else {
      query(remove)
      await assert.rejects(queryAsync(send),e=>/Interlocutor indisponível/.test(String(e.stdout)+String(e.stderr)))
    }
    query(`drop trigger message_test_pause on private.messages; drop function private.message_test_pause(); drop table private.message_test_order;
      delete from private.message_requests where user_id=${actor};
      delete from private.messages where author_user_id=${actor}; delete from private.conversations where created_by=${actor};
      delete from private.message_identities where owner_user_id in (${actor},'70000000-0000-4000-8000-000000000002');
      begin; delete from public.collectives where id='74000000-0000-4000-8000-000000000001';
      delete from auth.users where id in (${actor},'70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003'); commit;`)
  }
}
