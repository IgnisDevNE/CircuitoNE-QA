import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// queryAsync usa conexões PostgreSQL independentes; não simula locks em JavaScript.
export async function checkCollectiveConcurrency(query, queryAsync) {
  for (const scenario of ['transfer', 'decision', 'remove']) {
    query(readFileSync('tests/database/collective-concurrency.sql', 'utf8'))
    if (scenario === 'transfer') query(`insert into private.collective_memberships(collective_id,user_id,role_id) values
      ('74000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003','75000000-0000-4000-8000-000000000001')`)
    const collective = `'74000000-0000-4000-8000-000000000001'`
    const request = `'77000000-0000-4000-8000-000000000001'`
    const action = (index) => scenario === 'decision'
      ? `select public.decide_collective_request(${request},true);`
      : scenario === 'remove' && index === 2
        ? `select public.remove_collective_member(${collective},'70000000-0000-4000-8000-000000000002');`
        : `select public.transfer_collective_ownership(${collective},'70000000-0000-4000-8000-00000000000${index + 1}');`
    const results = await Promise.allSettled([1, 2].map(index => queryAsync(`begin;
      set local lock_timeout='10s'; set local statement_timeout='15s'; set local role authenticated;
      select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2","session_id":"72000000-0000-4000-8000-000000000001"}',true);
      ${action(index)} select pg_sleep(0.5); commit;`)))
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1, `${scenario}: uma operação deve vencer`)
    const failure = results.find(r => r.status === 'rejected').reason
    assert.match(String(failure.stdout) + String(failure.stderr), /Operação não autorizada|Pedido já decidido|Transferência exige/, scenario)
    query(`do $$ begin
      if not exists(select from public.collectives c join private.collective_memberships m on m.collective_id=c.id and m.user_id=c.owner_user_id where c.id=${collective}) then
        raise exception 'Concorrência deixou proprietário sem vínculo'; end if;
      if exists(select from private.collective_memberships m join public.collectives c on c.id=m.collective_id
        where c.id=${collective} and c.owner_user_id<>'70000000-0000-4000-8000-000000000001'
          and m.user_id='70000000-0000-4000-8000-000000000001' and m.role_id<>c.member_role_id) then
        raise exception 'Ex-proprietário reteve perfil privilegiado'; end if;
      if '${scenario}'='decision' and (select count(*) from private.collective_memberships where collective_id=${collective})<>3 then
        raise exception 'Decisão concorrente não admitiu exatamente um membro'; end if;
      end $$;
      begin; delete from public.collectives where id=${collective};
      delete from auth.users where id in ('70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003'); commit;`)
  }
}
