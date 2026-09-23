import { strict as assert } from 'node:assert'
import test from 'node:test'
import { resumeAfterApproval } from '../scripts/resume.mjs'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)
const C = 'c'.repeat(40)
const QA = 'IgnisDevNE/CircuitoNE-QA'
const SOURCE = 'IgnisDevNE/CircuitoNE'
const event = { action: 'submitted', review: { id: 7, state: 'approved', commit_id: A,
  user: { login: 'magalz' } }, pull_request: { number: 12 } }
const proposal = { number: 12, state: 'open', draft: false,
  user: { login: 'circuitone-qa-publisher[bot]' },
  base: { ref: 'accepted' },
  head: { ref: 'proposals/source-pr-70', sha: A, repo: { full_name: QA } } }
const sourcePr = { number: 70, state: 'open', base: { ref: 'main', sha: B },
  head: { sha: C, repo: { full_name: SOURCE } } }
const run = { id: 123, name: 'CI', path: '.github/workflows/ci.yml', status: 'completed',
  conclusion: 'success', event: 'pull_request', head_sha: C,
  repository: { full_name: SOURCE }, head_repository: { full_name: SOURCE } }

function api(overrides = {}) {
  const paths = {
    [`/repos/${QA}/pulls/12`]: proposal,
    [`/repos/${QA}/pulls/12/reviews?per_page=100`]: [{ ...event.review, state: 'APPROVED' }],
    [`/repos/${SOURCE}/pulls/70`]: sourcePr,
    [`/repos/${SOURCE}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${C}&status=completed&per_page=100`]: { workflow_runs: [run] },
    [`/repos/${SOURCE}/actions/runs/123`]: run,
    [`/repos/${SOURCE}/branches/main`]: { commit: { sha: B } },
    [`/repos/${SOURCE}/commits/${C}/pulls`]: [sourcePr],
    ...overrides,
  }
  return async (path) => {
    assert.ok(path in paths, `Unexpected API request: ${path}`)
    return paths[path]
  }
}

test('approved current QA review resumes exact source CI in canonical verifier', async () => {
  const calls = []
  await resumeAfterApproval(event, api(), async (runId) => calls.push(runId))
  assert.deepEqual(calls, [123])
})

test('stale review, foreign proposal, and advanced source base cannot dispatch', async () => {
  const dispatch = () => assert.fail('Must not dispatch')
  await assert.rejects(resumeAfterApproval(event, api({ [`/repos/${QA}/pulls/12/reviews?per_page=100`]:
    [{ ...event.review, state: 'APPROVED', commit_id: B }] }), dispatch), /review|approval/i)
  await assert.rejects(resumeAfterApproval(event, api({ [`/repos/${QA}/pulls/12`]:
    { ...proposal, head: { ...proposal.head, repo: { full_name: SOURCE } } } }), dispatch), /proposal/i)
  await assert.rejects(resumeAfterApproval(event, api({ [`/repos/${SOURCE}/branches/main`]:
    { commit: { sha: A } } }), dispatch), /base advanced/i)
})

test('closed source, failed CI and replayed old review cannot dispatch', async () => {
  const dispatch = () => assert.fail('Must not dispatch')
  await assert.rejects(resumeAfterApproval(event, api({ [`/repos/${SOURCE}/pulls/70`]:
    { ...sourcePr, state: 'closed' } }), dispatch), /source PR/i)
  await assert.rejects(resumeAfterApproval(event, api({
    [`/repos/${SOURCE}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${C}&status=completed&per_page=100`]:
      { workflow_runs: [] },
  }), dispatch), /successful CI/i)
  await assert.rejects(resumeAfterApproval(event, api({ [`/repos/${QA}/pulls/12/reviews?per_page=100`]:
    [{ ...event.review, state: 'APPROVED' }, { ...event.review, id: 8, state: 'CHANGES_REQUESTED' }] }), dispatch), /review|approval/i)
})

test('a newer failed CI cannot be bypassed by an older successful run on the same SHA', async () => {
  const path = `/repos/${SOURCE}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${C}&status=completed&per_page=100`
  await assert.rejects(resumeAfterApproval(event, api({ [path]: { workflow_runs: [run,
    { ...run, id: 124, conclusion: 'failure' }] } }), () => assert.fail('Must not dispatch')), /successful CI/i)
})

test('incomplete review or CI pages cannot resume an older approval', async () => {
  const dispatch = () => assert.fail('Must not dispatch')
  const reviews = Array.from({ length: 100 }, () => ({ ...event.review, state: 'APPROVED' }))
  await assert.rejects(resumeAfterApproval(event, api({
    [`/repos/${QA}/pulls/12/reviews?per_page=100`]: reviews,
  }), dispatch), /review|page|limit/i)
  const path = `/repos/${SOURCE}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${C}&status=completed&per_page=100`
  await assert.rejects(resumeAfterApproval(event, api({
    [path]: { workflow_runs: Array.from({ length: 100 }, () => run) },
  }), dispatch), /CI|page|limit/i)
  await assert.rejects(resumeAfterApproval(event, api({
    [path]: { workflow_runs: [run], total_count: 101 },
  }), dispatch), /CI|page|limit/i)
})
