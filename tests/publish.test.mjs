import { strict as assert } from 'node:assert'
import test from 'node:test'
import { decideConclusion } from '../scripts/publish.mjs'
import { failureCheck, identifyFailedSource, reportFailedResolution } from '../scripts/publish-failure.mjs'

const SHA = 'a'.repeat(40)
const S = 'b'.repeat(40)
const expected = { sourceSha: SHA, sourceMainSha: S, sourcePr: 54, runId: 123, suiteSha: S, acceptedSha: S, sourceCiConclusion: 'success' }

test('publishes success only for the exact current source and suite', () => {
  assert.equal(decideConclusion(expected, expected, 'success'), 'success')
  assert.equal(decideConclusion(expected, { ...expected, sourceSha: 'c'.repeat(40) }, 'success'), 'failure')
  assert.equal(decideConclusion(expected, { ...expected, acceptedSha: 'c'.repeat(40) }, 'success'), 'failure')
  assert.equal(decideConclusion(expected, { ...expected, sourceCiConclusion: 'failure' }, 'success'), 'failure')
  assert.equal(decideConclusion(expected, expected, 'failure'), 'failure')
})

test('a failed resolution reports failure only on the trusted source PR commit', async () => {
  const run = {
    id: 123, name: 'CI', path: '.github/workflows/ci.yml', event: 'pull_request',
    status: 'completed', head_sha: SHA, head_branch: 'codex/qa-report',
    created_at: '2026-09-22T23:35:56Z', pull_requests: [],
    repository: { full_name: 'IgnisDevNE/CircuitoNE' },
    head_repository: { full_name: 'IgnisDevNE/CircuitoNE' },
  }
  const pulls = [{
    number: 61, state: 'open', created_at: '2026-09-22T22:00:00Z',
    head: { sha: SHA, ref: 'codex/qa-report', repo: { full_name: 'IgnisDevNE/CircuitoNE' } },
    base: { ref: 'main' },
  }]
  assert.equal(identifyFailedSource(123, run, pulls), SHA)
  assert.throws(() => identifyFailedSource(124, run, pulls), /trusted source PR CI/)
  assert.throws(() => identifyFailedSource(123, { ...run, event: 'push' }, pulls), /trusted source PR CI/)
  assert.throws(() => identifyFailedSource(123, { ...run, head_repository: { full_name: 'attacker/repo' } }, pulls), /trusted source PR CI/)
  assert.throws(() => identifyFailedSource(123, run, [{ ...pulls[0], state: 'closed' }]), /exact open source PR/)
  assert.throws(() => identifyFailedSource(123, run, [{ ...pulls[0], head: { ...pulls[0].head, sha: S } }]), /exact open source PR/)
  assert.throws(() => identifyFailedSource(123, run, [{ ...pulls[0], head: { ...pulls[0].head, ref: 'another-branch' } }]), /exact open source PR/)
  assert.throws(() => identifyFailedSource(123, run, [{ ...pulls[0], created_at: '2026-09-22T23:36:00Z' }]), /exact open source PR/)
  assert.throws(() => identifyFailedSource(123, { ...run, pull_requests: [{ number: 60 }] }, pulls), /exact open source PR/)
  assert.throws(() => identifyFailedSource(123, run, [pulls[0], pulls[0]]), /exact open source PR/)
  assert.throws(() => identifyFailedSource(123, run, [pulls[0],
    ...Array.from({ length: 99 }, () => ({ ...pulls[0], state: 'closed' }))]), /page|limit|incomplete/i)
  const check = failureCheck(SHA, 123, 'https://github.com/IgnisDevNE/CircuitoNE-QA/actions/runs/456')
  assert.equal(check.head_sha, SHA)
  assert.equal(check.name, 'canonical-acceptance')
  assert.equal(check.status, 'completed')
  assert.equal(check.conclusion, 'failure')
  assert.match(check.details_url, /actions\/runs\/456$/)
  const published = []
  const requested = []
  const get = async (path) => {
    requested.push(path)
    return path.endsWith('/actions/runs/123') ? run : pulls
  }
  await reportFailedResolution('123', check.details_url, get, async (payload) => published.push(payload))
  assert.ok(requested.includes(`/repos/IgnisDevNE/CircuitoNE/commits/${SHA}/pulls?per_page=100`))
  assert.deepEqual(published, [check])
  await assert.rejects(
    reportFailedResolution('123', check.details_url, async (path) => path.endsWith('/actions/runs/123')
      ? run : [{ ...pulls[0], state: 'closed' }], async (payload) => published.push(payload)),
    /exact open source PR/,
  )
  assert.equal(published.length, 1)
})
