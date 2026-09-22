import { strict as assert } from 'node:assert'
import test from 'node:test'
import { assertPromotionEvidence } from '../scripts/promote.mjs'

const C = 'a'.repeat(40)
const M = 'b'.repeat(40)
const S = 'c'.repeat(40)
const Q = 'd'.repeat(40)
const W = 'e'.repeat(40)
const expected = { sourceSha: M, sourceMainSha: S, sourcePr: 54, suiteSha: Q, acceptedSha: S, runId: 123 }
const pr = { number: 54, merged_at: '2026-09-22T00:00:00Z', merge_commit_sha: M,
  base: { ref: 'main' }, head: { sha: C } }
const reviews = [{ user: { login: 'magalz' }, state: 'APPROVED', commit_id: C }]
const checks = [{ id: 10, name: 'canonical-acceptance', app: { id: 999 }, head_sha: C,
  status: 'completed', conclusion: 'success', external_id: `run=122;source=${C};suite=${Q};accepted=${S};workflow=${W}` }]

test('requires independent check and approval for the exact merged content', () => {
  assert.doesNotThrow(() => assertPromotionEvidence(expected, pr, reviews, checks, 999, W))
  assert.throws(() => assertPromotionEvidence(expected, pr, reviews, [{ ...checks[0], app: { id: 5028495 } }], 999, W), /QA App/i)
  assert.throws(() => assertPromotionEvidence(expected, pr, [{ ...reviews[0], commit_id: S }], checks, 999, W), /approval/i)
  assert.throws(() => assertPromotionEvidence(expected, { ...pr, merge_commit_sha: C }, reviews, checks, 999, W), /merge/i)
  assert.throws(() => assertPromotionEvidence(expected, pr, reviews, checks, 999, 'f'.repeat(40)), /check/i)
  assert.throws(() => assertPromotionEvidence(expected, pr, reviews, [
    ...checks, { ...checks[0], id: 11, conclusion: 'failure' },
  ], 999, W), /check/i)
})
