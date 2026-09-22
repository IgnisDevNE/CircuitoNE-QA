import { strict as assert } from 'node:assert'
import test from 'node:test'
import { resolveSourceRun } from '../scripts/resolve.mjs'

const SHA = 'a'.repeat(40)
const MAIN = 'b'.repeat(40)
const HEAD = 'c'.repeat(40)
const TREE = 'd'.repeat(40)
const run = { id: 123, name: 'CI', path: '.github/workflows/ci.yml', event: 'pull_request',
  status: 'completed', conclusion: 'success', head_sha: SHA, head_branch: 'codex/example',
  repository: { full_name: 'IgnisDevNE/CircuitoNE' }, head_repository: { full_name: 'IgnisDevNE/CircuitoNE' } }
const pr = { number: 54, state: 'open', head: { sha: SHA, repo: { full_name: 'IgnisDevNE/CircuitoNE' } },
  base: { ref: 'main', sha: MAIN } }

function api(overrides = {}) {
  const values = {
    '/repos/IgnisDevNE/CircuitoNE/actions/runs/123': run,
    [`/repos/IgnisDevNE/CircuitoNE/commits/${SHA}/pulls`]: [pr],
    '/repos/IgnisDevNE/CircuitoNE/branches/main': { commit: { sha: MAIN } },
    ...overrides,
  }
  return async (path) => {
    if (!(path in values)) throw new Error(`Unexpected API call: ${path}`)
    return values[path]
  }
}

test('resolves an exact open PR from a completed trusted CI run', async () => {
  assert.deepEqual(await resolveSourceRun('123', 'accept', api()),
    { mode: 'accept', sourceSha: SHA, sourceMainSha: MAIN, sourcePr: 54, runId: 123, sourceCiConclusion: 'success' })
})

test('rejects a stale head, wrong workflow or advanced base', async () => {
  await assert.rejects(resolveSourceRun('123', 'accept', api({
    [`/repos/IgnisDevNE/CircuitoNE/commits/${SHA}/pulls`]: [{ ...pr, head: { ...pr.head, sha: MAIN } }],
  })), /exact open PR/i)
  await assert.rejects(resolveSourceRun('123', 'accept', api({
    '/repos/IgnisDevNE/CircuitoNE/actions/runs/123': { ...run, path: '.github/workflows/fake.yml' },
  })), /trusted CI/i)
  await assert.rejects(resolveSourceRun('123', 'accept', api({
    '/repos/IgnisDevNE/CircuitoNE/branches/main': { commit: { sha: SHA } },
  })), /base advanced/i)
})

test('promotes only a successful main push caused by a merged PR', async () => {
  const pushRun = { ...run, event: 'push', head_branch: 'main' }
  const merged = { ...pr, state: 'closed', merged_at: '2026-09-22T00:00:00Z', head: { ...pr.head, sha: HEAD } }
  const get = api({
    '/repos/IgnisDevNE/CircuitoNE/actions/runs/123': pushRun,
    [`/repos/IgnisDevNE/CircuitoNE/commits/${SHA}/pulls`]: [merged],
    '/repos/IgnisDevNE/CircuitoNE/branches/main': { commit: { sha: SHA } },
    [`/repos/IgnisDevNE/CircuitoNE/commits/${SHA}`]: { parents: [{ sha: MAIN }], commit: { tree: { sha: TREE } } },
    [`/repos/IgnisDevNE/CircuitoNE/commits/${HEAD}`]: { commit: { tree: { sha: TREE } } },
  })
  assert.deepEqual(await resolveSourceRun('123', 'promote', get),
    { mode: 'promote', sourceSha: SHA, sourceMainSha: MAIN, sourcePr: 54, runId: 123, sourceCiConclusion: 'success' })
  await assert.rejects(resolveSourceRun('123', 'promote', api({
    '/repos/IgnisDevNE/CircuitoNE/actions/runs/123': pushRun,
    [`/repos/IgnisDevNE/CircuitoNE/commits/${SHA}/pulls`]: [merged],
    '/repos/IgnisDevNE/CircuitoNE/branches/main': { commit: { sha: SHA } },
    [`/repos/IgnisDevNE/CircuitoNE/commits/${SHA}`]: { parents: [{ sha: MAIN }], commit: { tree: { sha: TREE } } },
    [`/repos/IgnisDevNE/CircuitoNE/commits/${HEAD}`]: { commit: { tree: { sha: MAIN } } },
  })), /tree/i)
})
