import { strict as assert } from 'node:assert'
import test from 'node:test'
import { chooseApprovedSuite } from '../scripts/proposal.mjs'
import { acceptedState } from '../scripts/proposal.mjs'

const S = 'a'.repeat(40)
const Q = 'b'.repeat(40)
const QA = 'IgnisDevNE/CircuitoNE-QA'
const proposal = { number: 7, state: 'open', draft: false, base: { ref: 'accepted' },
  head: { ref: 'proposals/source-pr-54', sha: Q, repo: { full_name: QA } } }

function api(pulls = [], reviews = []) {
  return async (path) => path.includes('/reviews') ? reviews : pulls
}

test('uses accepted suite when no proposal exists', async () => {
  assert.deepEqual(await chooseApprovedSuite(54, S, api()), { suiteSha: S, proposalPr: null })
})

test('uses only exact QA proposal approved at its current commit', async () => {
  const approved = { user: { login: 'magalz' }, state: 'APPROVED', commit_id: Q }
  assert.deepEqual(await chooseApprovedSuite(54, S, api([proposal], [approved])), { suiteSha: Q, proposalPr: 7 })
  await assert.rejects(chooseApprovedSuite(54, S, api([proposal], [{ ...approved, commit_id: S }])), /approved/i)
  await assert.rejects(chooseApprovedSuite(54, S, api([proposal], [{ ...approved, state: 'DISMISSED' }])), /approved/i)
})

test('rejects ambiguous or external proposals', async () => {
  const approved = { user: { login: 'magalz' }, state: 'APPROVED', commit_id: Q }
  await assert.rejects(chooseApprovedSuite(54, S, api([proposal, proposal], [approved])), /ambiguous/i)
  assert.deepEqual(await chooseApprovedSuite(54, S, api([{ ...proposal, head: { ...proposal.head, repo: { full_name: 'attacker/fork' } } }], [approved])),
    { suiteSha: S, proposalPr: null })
})

test('promotion retries are no-ops only for the same merged PR', () => {
  const state = { source_main_sha: Q, promoted_source_pr: 54, promoted_suite_sha: S }
  assert.deepEqual(acceptedState(state, 'promote', Q, S, 54, S), { alreadyPromoted: true })
  assert.throws(() => acceptedState(state, 'promote', Q, S, 55, S), /different PR/i)
  assert.throws(() => acceptedState(state, 'accept', Q, S, 54, S), /advanced/i)
})
