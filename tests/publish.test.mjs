import { strict as assert } from 'node:assert'
import test from 'node:test'
import { decideConclusion } from '../scripts/publish.mjs'

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
