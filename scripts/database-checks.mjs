import assert from 'node:assert/strict'
import { execFileSync, execFile } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { createConnection } from 'node:net'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const input=JSON.parse(readFileSync('input.json','utf8'))
const client=resolve('scripts/sql-client.mjs')
const query=sql=>execFileSync(process.execPath,[client],{input:sql,encoding:'utf8',stdio:'pipe',timeout:30000,maxBuffer:1024*1024})
const queryAsync=sql=>new Promise((yes,no)=>{
  const child=execFile(process.execPath,[client],{encoding:'utf8',timeout:30000,maxBuffer:1024*1024},(error,stdout,stderr)=>{
    if(error) { error.stdout=stdout;error.stderr=stderr;no(error) } else yes({stdout,stderr})
  })
  child.stdin.end(sql)
})
const file=name=>query(readFileSync(`tests/database/${name}`,'utf8'))
const fails=(sql,pattern)=>assert.throws(()=>query(sql),error=>pattern.test(String(error.stderr)))
try {
  assert.throws(()=>writeFileSync('/qa/forged-result','success'),/EROFS|EACCES/)
  assert.ok(!existsSync('/var/run/docker.sock')&&!existsSync('/run/podman/podman.sock'))
  await new Promise((yes,no)=>{
    const socket=createConnection({host:'1.1.1.1',port:443})
    socket.setTimeout(2000,()=>{socket.destroy();yes()})
    socket.once('error',()=>{socket.destroy();yes()})
    socket.once('connect',()=>{socket.destroy();no(new Error('Checker has external network access'))})
  })
  query(`do $$ begin
    if current_setting('server_version_num')::int / 10000 <> 17 or to_regclass('auth.sessions') is null or to_regclass('auth.mfa_factors') is null then raise exception 'Official PG/Auth baseline missing'; end if;
    end $$;`)
  // SQL is sent through the protocol, never interpreted as psql shell commands.
  fails('\\! touch /qa/candidate-wrote-here',/42601/)
  file('legacy-default-grants.sql')
  for(const {sql} of input.migrations) query(sql)
  file('pipeline-probe.sql')
  for(const name of input.plan.assertions) file(name)
  for(const name of input.plan.concurrency) {
    const exports=Object.values(await import(pathToFileURL(resolve('tests/database',name))))
    assert.equal(exports.length,1,`Expected one concurrency check in ${name}`)
    assert.equal(typeof exports[0],'function')
    await exports[0](query,queryAsync)
  }
  query('alter table public.phase0_pipeline_probe disable row level security')
  assert.throws(()=>file('post-migration.sql'),error=>/Tabela pública sem RLS/.test(String(error.stderr)))
  query('alter table public.phase0_pipeline_probe enable row level security')
  query('grant select on public.phase0_pipeline_probe to anon')
  assert.throws(()=>file('post-migration.sql'),error=>/Ensaio expôs privilégios/.test(String(error.stderr)))
  query('revoke select on public.phase0_pipeline_probe from anon')
  file('post-migration.sql')
  const seeds=new Map(input.seeds.map(s=>[s.name,s.sql]))
  assert.deepEqual([...seeds.keys()].sort(),['collectives.sql','events.sql','identity.sql','messages.sql'])
  for(const [name,check] of [['identity.sql','identity-seed.sql'],['collectives.sql','collective-seed.sql'],['events.sql','event-seed.sql'],['messages.sql','message-seed.sql']]) {
    const sql=seeds.get(name)
    fails(sql,/Seed exige destino sintético/)
    if(['events.sql','messages.sql'].includes(name)) fails(`set circuitone.seed_target='disposable';\n${sql}`,/Seed exige referência temporal/)
    query(`set circuitone.seed_target='disposable'; set circuitone.seed_time='2026-09-26T12:00Z';\n${sql}`)
    if(name==='identity.sql') query(`insert into public.profiles(id,owner_id,kind,name,city,state_code) values
      ('02000000-0000-4000-8000-000000000999','01000000-0000-4000-8000-000000000001','artist','Sentinela','Recife','PE')`)
    query(`set circuitone.seed_target='disposable'; set circuitone.seed_time='2026-09-26T12:00Z';\n${sql}`)
    if(name==='identity.sql') file('identity-seed-preserves-others.sql')
    file(check)
  }
  console.log('Canonical database acceptance passed')
} catch(error) {
  console.error(JSON.stringify({error:String(error.message),detail:String(error.stderr||'').slice(0,3000)}))
  process.exitCode=1
}
