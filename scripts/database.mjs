import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { setTimeout } from 'node:timers/promises'

// Official images used by the source CI, pinned independently by QA.
export const PG='public.ecr.aws/supabase/postgres@sha256:16c0944c77885446d4f2ebbb2191b357feeb3b1295bde2fb1978c113129dbeb4' // 17.6.1.167
const AUTH='public.ecr.aws/supabase/gotrue@sha256:7e813221b93fbf54b515036438550e483bfaf057b9db52fe9bc1ce91c47e817e' // v2.196.0
const NODE='docker.io/library/node@sha256:0e0ff40c39bc087845bfb27465a0df4ea419520094bc35842ff83dd8cbe6f9b6' // 24.21.0 bookworm slim
const restrictions=['--read-only','--cap-drop','ALL','--security-opt','no-new-privileges','--pids-limit','128','--cpus','2']

export function postgresArgs(name) {
  return ['run','--detach','--name',name,'--network','none',...restrictions,'--user','100:101','--memory','1g',
    '--tmpfs','/var/lib/postgresql/data:rw,nosuid,nodev,mode=1777,size=512m',
    '--tmpfs','/var/run/postgresql:rw,nosuid,nodev,mode=1777,size=16m',
    '--tmpfs','/tmp:rw,nosuid,nodev,mode=1777,size=16m',
    '--env','PGDATA=/var/lib/postgresql/data/pgdata','--env','POSTGRES_PASSWORD=qa-disposable',PG,
    'postgres','-c','listen_addresses=127.0.0.1','-c','unix_socket_directories=/var/run/postgresql']
}

export function candidateSql(repo, sha, root) {
  assert.match(sha,/^[a-f0-9]{40}$/,'Invalid candidate SHA')
  assert.ok(['docs/migrations','supabase/seeds'].includes(root))
  const git=(...args)=>execFileSync('git',['-C',repo,...args],{encoding:'utf8',maxBuffer:4*1024*1024})
  const entries=git('ls-tree','-r','-z',sha,'--',root).split('\0').filter(entry=>entry.endsWith('.sql'))
  assert.ok(entries.length,'SQL input tree is empty')
  return entries.map(entry=>{
    const match=/^100644 blob ([a-f0-9]{40})\t(.+)$/.exec(entry)
    assert.ok(match,'SQL must be regular committed blobs')
    const name=match[2].slice(root.length+1)
    assert.match(name,root==='docs/migrations'?/^\d{14}_[a-z0-9_]+\.sql$/:/^[a-z][a-z0-9-]*\.sql$/,'Unsupported SQL path')
    const sql=git('cat-file','blob',match[1])
    assert.ok(sql.trim(),'Empty SQL input')
    return {name,sql}
  }).sort((a,b)=>a.name.localeCompare(b.name))
}

export function databasePlan(files) {
  const fixtures=['legacy-default-grants.sql','pipeline-probe.sql','collective-concurrency.sql']
  const seeds=['identity-seed.sql','identity-seed-preserves-others.sql','collective-seed.sql','event-seed.sql','message-seed.sql']
  const required=['post-migration.sql','default-grants.sql','identity-profiles.sql','collectives.sql','events.sql','messages.sql','message-permissions.sql','lifecycle.sql',
    'collective-concurrency.mjs','event-concurrency.mjs','message-concurrency.mjs','lifecycle-concurrency.mjs',...fixtures,...seeds]
  for(const name of required) assert.ok(files.includes(name),`Canonical SQL missing: ${name}`)
  for(const name of files) assert.ok(/^[a-z][a-z0-9-]*\.sql$/.test(name)||/^[a-z][a-z0-9-]*-concurrency\.mjs$/.test(name),`Unsupported SQL suite file: ${name}`)
  for(const name of files.filter(f=>f.includes('-seed'))) assert.ok(seeds.includes(name),`Unsupported seed stage: ${name}`)
  return {assertions:files.filter(f=>f.endsWith('.sql')&&!fixtures.includes(f)&&!seeds.includes(f)).sort(),
    concurrency:files.filter(f=>f.endsWith('-concurrency.mjs')).sort()}
}

async function run(candidate, sha, suite) {
  const engine=process.env.QA_CONTAINER_ENGINE==='podman'?'podman':'docker'
  const container=(...args)=>execFileSync(engine,args,{encoding:'utf8',stdio:'pipe',timeout:180_000,maxBuffer:4*1024*1024})
  const here=dirname(fileURLToPath(import.meta.url))
  const work=mkdtempSync(join(tmpdir(),'circuitone-qa-sql-'))
  const name=`circuitone-qa-${process.pid}`
  try {
    const files=readdirSync(join(suite,'tests/database'))
    const plan=databasePlan(files)
    const input={migrations:candidateSql(candidate,sha,'docs/migrations'),seeds:candidateSql(candidate,sha,'supabase/seeds'),plan}
    mkdirSync(join(work,'scripts')); mkdirSync(join(work,'tests'))
    // No candidate build, package, helper or script is copied into the executor.
    for(const file of ['database-checks.mjs','sql-client.mjs']) cpSync(join(here,file),join(work,'scripts',file))
    cpSync(join(suite,'tests/database'),join(work,'tests/database'),{recursive:true})
    for(const file of ['package.json','pnpm-lock.yaml']) cpSync(join(here,'..',file),join(work,file))
    writeFileSync(join(work,'input.json'),JSON.stringify(input))
    writeFileSync(join(work,'Dockerfile'),`FROM ${NODE}\nWORKDIR /qa\nCOPY package.json pnpm-lock.yaml ./\nRUN npm install --global pnpm@10.34.3 && pnpm install --frozen-lockfile --ignore-scripts\nCOPY . .\nUSER 1000:1000\nCMD ["node","scripts/database-checks.mjs"]\n`)
    container('build','--quiet','--tag',name,work)
    for(let attempt=1;attempt<=2;attempt++) {
      container(...postgresArgs(name))
      let ready=false
      for(let tick=0;tick<60;tick++) {
        try {
          container('exec','--env','PGPASSWORD=qa-disposable',name,'psql','--no-psqlrc','-h','127.0.0.1','-U','supabase_admin','-d','postgres','-tAc','select 1')
          ready=true; break
        } catch { await setTimeout(1000) }
      }
      assert.ok(ready,'Disposable database did not start')
      container('run','--rm','--name',`${name}-auth`,'--network',`container:${name}`,...restrictions,'--memory','256m',
        '--env','GOTRUE_DB_DRIVER=postgres','--env','GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin:qa-disposable@127.0.0.1:5432/postgres?sslmode=disable',
        '--env','GOTRUE_SITE_URL=http://localhost','--env','API_EXTERNAL_URL=http://localhost',
        '--env','GOTRUE_JWT_SECRET=qa-disposable-only-at-least-32-characters',AUTH,'auth','migrate')
      const result=container('run','--rm','--name',`${name}-checks`,'--network',`container:${name}`,...restrictions,'--memory','384m',name)
      // Never relay SQL NOTICE/error text as GitHub workflow commands.
      assert.equal(result.trim(),'Canonical database acceptance passed')
      console.log(`Canonical database reconstruction ${attempt}/2 passed.`)
      container('rm','--force',name)
    }
  } finally {
    for(const item of [`${name}-checks`,`${name}-auth`,name]) {
      try { container('rm','--force',item) } catch { /* absent containers need no cleanup */ }
    }
    try { container('image','rm',name) } catch { /* host job also expires */ }
    assert.equal(dirname(realpathSync(work)),realpathSync(tmpdir()))
    rmSync(work,{recursive:true,force:true})
  }
}

if(process.argv[1]===fileURLToPath(import.meta.url)) {
  const [candidate,sha,suite]=process.argv.slice(2)
  try {
    assert.ok(candidate&&sha&&suite,'Usage: database.mjs candidate sha suite')
    await run(resolve(candidate),sha,resolve(suite))
  } catch(error) {
    // JSON encoding escapes line breaks in untrusted SQL responses.
    console.error(JSON.stringify({error:String(error.message),detail:String(error.stderr||'').slice(0,4000)}))
    process.exitCode=1
  }
}
