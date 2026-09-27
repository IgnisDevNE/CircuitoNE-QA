import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// Reutiliza a fixture de coletivo; cada disputa usa conexões PostgreSQL reais.
export async function checkEventConcurrency(query, queryAsync) {
  const collective = "'74000000-0000-4000-8000-000000000001'"
  const event = "'84000000-0000-4000-8000-000000000001'"
  const claims = `select set_config('request.jwt.claims','{"sub":"70000000-0000-4000-8000-000000000001","role":"authenticated"}',true);`
  for (const scenario of ['edit', 'publish', 'cancel', 'retry']) {
    query(readFileSync('tests/database/collective-concurrency.sql', 'utf8'))
    query(`insert into public.events(id,collective_id,name,kind,starts_at,city,state_code,venue,is_free)
      values(${event},${collective},'Concorrência sintética','festa','2099-01-01T21:00Z','Recife','PE','Local sintético',true)`)
    const action = index => scenario === 'retry'
      ? `select public.create_event(${collective},'{"name":"Retry","kind":"festa","starts_at":"2099-01-01T21:00Z","city":"Recife","state_code":"PE","venue":"Local sintético","is_free":true}', '85000000-0000-4000-8000-000000000001');`
      : index === 2 && scenario !== 'edit'
        ? `select public.${scenario}_event(${event},1);`
        : `select public.update_event(${event},1,'{"name":"Edição ${index}"}');`
    const results = await Promise.allSettled([1, 2].map(index => queryAsync(`begin;
      set local lock_timeout='10s'; set local statement_timeout='15s'; set local role authenticated;
      ${claims} ${action(index)} select pg_sleep(0.5); commit;`)))
    assert.equal(results.filter(r => r.status === 'fulfilled').length, scenario === 'retry' ? 2 : 1, scenario)
    if (scenario !== 'retry') {
      const failure = results.find(r => r.status === 'rejected').reason
      assert.match(String(failure.stdout) + String(failure.stderr), /Evento alterado; recarregue/, scenario)
    }
    query(`do $$ begin
      if '${scenario}'='retry' then
        if (select count(*) from public.events where collective_id=${collective})<>2 then raise exception 'Retry duplicou criação'; end if;
      elsif (select version from public.events where id=${event})<>2
        or (select count(*) from private.event_audit where event_id=${event})<>1 then
        raise exception 'Concorrência deixou versão/auditoria divergente'; end if;
      end $$;`)
    query(`begin; delete from public.events where collective_id=${collective};
      delete from public.collectives where id=${collective};
      delete from auth.users where id in ('70000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003'); commit;`)
  }
}
