import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function assertNoSkippedTests(report) {
  if (!Array.isArray(report?.suites)) throw new Error('Invalid Playwright report')
  let count = 0
  function visit(suite) {
    for (const spec of suite.specs ?? []) {
      for (const test of spec.tests ?? []) {
        count += 1
        if (test.expectedStatus === 'skipped' || test.results?.[0]?.status === 'skipped') {
          throw new Error('Canonical test skipped')
        }
        if (test.expectedStatus && test.expectedStatus !== 'passed') throw new Error('Canonical test expected to fail')
        if (test.results?.length !== 1 || test.results[0].status !== 'passed') {
          const detail = String(test.results?.[0]?.errors?.[0]?.message || '').replace(/[\x00-\x1f]+/g, ' ').slice(0, 300)
          throw new Error(`Canonical test failed or did not run: ${spec.title || 'unknown case'} ${detail}`)
        }
      }
    }
    for (const child of suite.suites ?? []) visit(child)
  }
  for (const suite of report.suites) visit(suite)
  if (!count) throw new Error('No tests executed')
  return count
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const file = process.argv[2]
    if (!file) throw new Error('Usage: results.mjs report.json')
    console.log(`Canonical tests passed (${assertNoSkippedTests(JSON.parse(readFileSync(file, 'utf8')))} cases).`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
