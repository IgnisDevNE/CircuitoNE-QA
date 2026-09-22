import assert from 'node:assert/strict'
import test from 'node:test'
import { cleanupClosedBranches } from '../scripts/cleanup.mjs'

const QA = 'IgnisDevNE/CircuitoNE-QA'
const SHA = 'a'.repeat(40)
const pr = (ref, overrides = {}) => ({
  state: 'closed', number: 3,
  base: { ref: 'accepted', repo: { full_name: QA } },
  head: { ref, sha: SHA, repo: { full_name: QA } },
  ...overrides,
})

test('deletes only the unchanged head of a closed QA PR with no open reuse', async () => {
  const calls = []
  const send = async (method, path) => {
    calls.push(`${method} ${path}`)
    if (path.includes('state=closed')) return [pr('proposals/source-pr-56'), pr('main'),
      pr('codex/fork', { head: { ref: 'codex/fork', sha: SHA, repo: { full_name: 'other/repo' } } }),
      pr('codex/changed'), pr('codex/reused')]
    if (path.includes('state=open')) return path.includes('codex%2Freused') ? [pr('codex/reused')] : []
    if (method === 'GET' && path.includes('/git/ref/')) return { object: { sha: path.endsWith('codex/changed') ? 'b'.repeat(40) : SHA } }
    return null
  }
  assert.deepEqual(await cleanupClosedBranches(send), ['proposals/source-pr-56'])
  assert.deepEqual(calls.filter((call) => call.startsWith('DELETE ')),
    [`DELETE /repos/${QA}/git/refs/heads/proposals/source-pr-56`])
})

test('missing refs are harmless, but API failures are not hidden', async () => {
  const send = async (method, path) => {
    if (path.includes('state=closed')) return [pr('codex/gone')]
    if (path.includes('state=open')) return []
    if (path.includes('/git/ref/')) return null
    throw new Error('unexpected request')
  }
  assert.deepEqual(await cleanupClosedBranches(send), [])
  await assert.rejects(cleanupClosedBranches(async () => { throw new Error('HTTP 403') }), /HTTP 403/)
})
