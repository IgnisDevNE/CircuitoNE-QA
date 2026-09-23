import { strict as assert } from 'node:assert'
import test from 'node:test'
import { closePromotedProposal } from '../scripts/close-promoted.mjs'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)
const QA = 'IgnisDevNE/CircuitoNE-QA'
const expected = { sourcePr: 70, proposalPr: 12, sourceSha: C, suiteSha: A, acceptedSha: B }
const state = { source_main_sha: C, promoted_source_pr: 70, promoted_suite_sha: A,
  previous_accepted_sha: B }
const proposal = { number: 12, state: 'open', user: { login: 'circuitone-qa-publisher[bot]' },
  base: { ref: 'accepted' }, head: { ref: 'proposals/source-pr-70', sha: A,
    repo: { full_name: QA } } }
const contents = { encoding: 'base64', content: Buffer.from(JSON.stringify(state)).toString('base64') }

function api(overrides = {}) {
  const paths = {
    [`/repos/${QA}/contents/.qa/state.json?ref=accepted`]: contents,
    [`/repos/${QA}/pulls/12`]: proposal,
    ...overrides,
  }
  return async (path) => {
    assert.ok(path in paths, `Unexpected API request: ${path}`)
    return paths[path]
  }
}

test('closes only the QA proposal recorded by successful accepted promotion', async () => {
  const calls = []
  await closePromotedProposal(expected, api(), async (...args) => calls.push(args))
  assert.deepEqual(calls, [[`/repos/${QA}/pulls/12`, { state: 'closed' }]])
})

test('mismatched promotion, proposal SHA or origin leaves proposal open', async () => {
  const patch = () => assert.fail('Must not close')
  await assert.rejects(closePromotedProposal(expected, api({
    [`/repos/${QA}/contents/.qa/state.json?ref=accepted`]:
      { encoding: 'base64', content: Buffer.from(JSON.stringify({ ...state, promoted_suite_sha: B })).toString('base64') },
  }), patch), /promotion/i)
  await assert.rejects(closePromotedProposal(expected, api({ [`/repos/${QA}/pulls/12`]:
    { ...proposal, head: { ...proposal.head, sha: B } } }), patch), /proposal/i)
  await assert.rejects(closePromotedProposal(expected, api({ [`/repos/${QA}/pulls/12`]:
    { ...proposal, user: { login: 'magalz' } } }), patch), /proposal/i)
})

test('retry accepts an already closed matching proposal without another write', async () => {
  await closePromotedProposal(expected, api({ [`/repos/${QA}/pulls/12`]:
    { ...proposal, state: 'closed' } }), () => assert.fail('Must not patch again'))
})
