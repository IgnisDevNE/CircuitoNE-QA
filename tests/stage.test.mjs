import { strict as assert } from 'node:assert'
import test from 'node:test'
import { closeObsoleteProposal } from '../scripts/stage.mjs'

test('closes a stale QA proposal when candidate restores the accepted tests', async () => {
  const calls = []
  const request = async (path, method, body) => {
    calls.push({ path, method, body })
    if (method === 'GET') return [{ number: 7, state: 'open', head: { ref: 'proposals/source-pr-54', repo: { full_name: 'IgnisDevNE/CircuitoNE-QA' } } }]
    return { state: 'closed' }
  }
  await closeObsoleteProposal(54, request)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1], { path: '/repos/IgnisDevNE/CircuitoNE-QA/pulls/7', method: 'PATCH', body: { state: 'closed' } })
})
