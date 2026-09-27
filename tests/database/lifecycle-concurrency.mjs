import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {setTimeout} from 'node:timers/promises'
export async function checkLifecycleConcurrency(query,queryAsync) {
  query(readFileSync('tests/database/collective-concurrency.sql','utf8'))
  query(`insert into public.profiles(id,owner_id,kind,name,city,state_code) select
    ('78000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,('70000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'member','Ensaio','Recife','PE' from generate_series(2,3) n;
    insert into private.account_deletions(user_id,requested_at,identity_due_at) values('70000000-0000-4000-8000-000000000002',now()-interval '1 day',now());
    update private.account_details set state='deletion_pending' where user_id='70000000-0000-4000-8000-000000000002';
    create function private.lifecycle_test_pause() returns trigger language plpgsql as $$ begin
      if new.user_id='70000000-0000-4000-8000-000000000003' and new.state='deletion_pending' then perform pg_sleep(2); end if; return new; end $$;
    create trigger lifecycle_test_pause before update on private.account_details for each row execute function private.lifecycle_test_pause();`)
  const deleting=queryAsync(`begin; set local application_name='lifecycle-delete'; set local role authenticated;
    select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
    select public.request_account_deletion(); commit;`)
  const deadline=Date.now()+10000
  while(!query("select case when exists(select from pg_stat_activity where application_name='lifecycle-delete' and wait_event='PgSleep') then 'READY' else 'WAIT' end").includes('READY')) {
    assert.ok(Date.now()<deadline,'Exclusão não alcançou disputa'); await setTimeout(20)
  }
  const sending=queryAsync(`begin; set local role authenticated;
    select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
    select public.send_message('profile','78000000-0000-4000-8000-000000000002','profile','78000000-0000-4000-8000-000000000003','Disputa',gen_random_uuid()); commit;`)
  const results=await Promise.allSettled([deleting,sending])
  for(const result of results) if(result.status==='rejected') assert.doesNotMatch(String(result.reason.stdout)+String(result.reason.stderr),/deadlock detected/)
  assert.equal(results[0].status,'fulfilled','Pedido válido não concluiu')
  assert.equal(results[1].status,'rejected','Conta em exclusão conseguiu enviar')
  assert.match(String(results[1].reason.stdout)+String(results[1].reason.stderr),/Conta confirmada necessária/)
  query(`drop trigger lifecycle_test_pause on private.account_details; drop function private.lifecycle_test_pause();
    begin; delete from public.collectives where id='74000000-0000-4000-8000-000000000001';
    delete from auth.users where id in('70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003');
    delete from private.account_deletions; commit;`)
  const transfer=`begin; set local application_name='lifecycle-first'; set local role authenticated;
    select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"72000000-0000-4000-8000-000000000001"}',true);
    select public.transfer_collective_ownership('74000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002');`
  const remove=`begin; set local application_name='lifecycle-first'; set local role authenticated;
    select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
    select public.request_account_deletion();`
  for(const firstIsTransfer of [true,false]) {
    query(readFileSync('tests/database/collective-concurrency.sql','utf8'))
    const first=queryAsync((firstIsTransfer?transfer:remove)+' select pg_sleep(1); commit;')
    const until=Date.now()+10000
    while(!query("select case when exists(select from pg_stat_activity where application_name='lifecycle-first' and wait_event='PgSleep') then 'READY' else 'WAIT' end").includes('READY')) {
      assert.ok(Date.now()<until,'Transferência/exclusão não iniciou'); await setTimeout(20)
    }
    const second=queryAsync((firstIsTransfer?remove:transfer)+' commit;')
    const results=await Promise.allSettled([first,second])
    assert.equal(results[0].status,'fulfilled')
    assert.equal(results[1].status,'rejected')
    assert.match(String(results[1].reason.stderr),firstIsTransfer?/Transfira a propriedade/:/sucessor elegível/)
    query(`begin; delete from public.collectives where id='74000000-0000-4000-8000-000000000001';
      delete from auth.users where id in('70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003');
      delete from private.account_deletions where user_id in('70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003'); commit;`)
  }
}