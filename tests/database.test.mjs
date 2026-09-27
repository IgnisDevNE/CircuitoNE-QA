import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { candidateSql, databasePlan, postgresArgs } from '../scripts/database.mjs'

test('SQL inputs come from regular committed blobs, not working tree scripts', t => {
  const dir=mkdtempSync(join(tmpdir(),'qa-inputs-'))
  t.after(()=>rmSync(dir,{recursive:true,force:true}))
  const git=(...args)=>execFileSync('git',['-C',dir,...args],{encoding:'utf8'}).trim()
  git('init','-q'); git('config','user.name','QA'); git('config','user.email','qa@example.invalid')
  mkdirSync(join(dir,'docs/migrations'),{recursive:true})
  writeFileSync(join(dir,'docs/migrations/20260922000000_probe.sql'),'select 1;')
  git('add','.'); git('commit','-qm','fixture')
  const sha=git('rev-parse','HEAD')
  writeFileSync(join(dir,'docs/migrations/20260922000000_probe.sql'),'select 999;')
  assert.equal(candidateSql(dir,sha,'docs/migrations')[0].sql,'select 1;')
  assert.throws(()=>candidateSql(dir,'main','docs/migrations'),/SHA/)
  assert.throws(()=>candidateSql(dir,sha,'supabase/seeds'),/empty/)
  writeFileSync(join(dir,'docs/migrations/escape.sql'),'bad path')
  git('add','.'); git('commit','-qm','bad filename')
  assert.throws(()=>candidateSql(dir,git('rev-parse','HEAD'),'docs/migrations'),/path/)
})

test('suite requires SQL assertions and accounts for every file', () => {
  const files=['post-migration.sql','default-grants.sql','legacy-default-grants.sql','pipeline-probe.sql',
    'identity-profiles.sql','collectives.sql','events.sql','messages.sql','message-permissions.sql','lifecycle.sql',
    'collective-concurrency.sql','collective-concurrency.mjs','event-concurrency.mjs','message-concurrency.mjs','lifecycle-concurrency.mjs',
    'identity-seed.sql','identity-seed-preserves-others.sql','collective-seed.sql','event-seed.sql','message-seed.sql']
  assert.ok(databasePlan(files).assertions.includes('messages.sql'))
  assert.ok(databasePlan([...files,'new-rule.sql']).assertions.includes('new-rule.sql'))
  assert.throws(()=>databasePlan([]),/missing/)
  assert.throws(()=>databasePlan(files.filter(f=>f!=='messages.sql')),/missing/)
  assert.throws(()=>databasePlan([...files,'run.sh']),/Unsupported/)
  assert.throws(()=>databasePlan([...files,'unknown-seed.sql']),/Unsupported/)
})

test('database has no host mount, network, privileges or writable system', () => {
  const args=postgresArgs('qa-test')
  assert.equal(args[args.indexOf('--network')+1],'none')
  assert.equal(args[args.indexOf('--user')+1],'100:101')
  assert.equal(args[args.indexOf('--cap-drop')+1],'ALL')
  assert.ok(args.includes('--read-only'))
  assert.ok(args.includes('no-new-privileges'))
  assert.ok(!args.some(a=>['--volume','-v','--mount','--privileged','--publish','-p'].includes(a)))
})
