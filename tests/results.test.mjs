import { strict as assert } from 'node:assert'
import test from 'node:test'
import { assertNoSkippedTests } from '../scripts/results.mjs'

const report = (tests) => ({ suites: [{ specs: tests.map((status) => ({ tests: [{ results: [{ status }] }] })) }] })

test('requires actual successful test execution', () => {
  assert.equal(assertNoSkippedTests(report(['passed', 'passed'])), 2)
  assert.throws(() => assertNoSkippedTests(report([])), /no tests/i)
  assert.throws(() => assertNoSkippedTests(report(['skipped'])), /skipped/i)
  assert.throws(() => assertNoSkippedTests(report(['failed'])), /failed/i)
})

test('reports the failed canonical case without accepting its result', () => {
  const failed = { suites: [{ specs: [{ title: 'rota pública /', tests: [{ results: [{ status: 'failed', errors: [{ message: 'Expected title Início' }] }] }] }] }] }
  assert.throws(() => assertNoSkippedTests(failed), /rota pública \/.*Expected title Início/)
})

test('reports all failed cases from the same run so the accepted suite can be fixed together', () => {
  const failed = { suites: [{ specs: [
    { title: 'primeira rota', tests: [{ results: [{ status: 'failed' }] }] },
    { title: 'segunda rota', tests: [{ results: [{ status: 'failed' }] }] },
  ] }] }
  assert.throws(() => assertNoSkippedTests(failed), (error) =>
    error.message.includes('primeira rota') && error.message.includes('segunda rota'))
})
