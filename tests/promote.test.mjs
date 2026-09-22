import { strict as assert } from 'node:assert'
import test from 'node:test'
import { assertPromotionEvidence } from '../scripts/promote.mjs'

const C = 'a'.repeat(40)
const M = 'b'.repeat(40)
const S = 'c'.repeat(40)
const Q = 'd'.repeat(40)
const W = 'e'.repeat(40)
const expected = { sourceSha: M, sourceMainSha: S, sourcePr: 54, suiteSha: Q, acceptedSha: S, runId: 123 }
const pr = { number: 54, merged_at: '2026-09-22T00:00:00Z',
  base: { ref: 'main' }, head: { sha: C } }
const reviews = [{ user: { login: 'magalz' }, state: 'APPROVED', commit_id: C }]
const checks = [{ id: 10, name: 'canonical-acceptance', app: { id: 999 }, head_sha: C,
  status: 'completed', conclusion: 'success', external_id: `run=122;source=${C};suite=${Q};accepted=${S};workflow=${W}` }]

test('requires independent check and approval for the exact merged content', () => {
  assert.equal(assertPromotionEvidence(expected, pr, reviews, checks, 999), W)
  assert.throws(() => assertPromotionEvidence(expected, pr, reviews, [{ ...checks[0], app: { id: 5028495 } }], 999), /QA App/i)
  assert.throws(() => assertPromotionEvidence(expected, pr, [{ ...reviews[0], commit_id: S }], checks, 999), /approval/i)
  assert.throws(() => assertPromotionEvidence(expected, { ...pr, number: 53 }, reviews, checks, 999), /merge/i)
  assert.throws(() => assertPromotionEvidence(expected, pr, reviews, [{ ...checks[0], external_id: checks[0].external_id.replace(W, 'invalid') }], 999), /check/i)
  assert.throws(() => assertPromotionEvidence(expected, pr, reviews, [
    ...checks, { ...checks[0], id: 11, conclusion: 'failure' },
  ], 999), /check/i)
})
