import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('runs Playwright directly so the result file contains only JSON', () => {
  const workflow = readFileSync(new URL('../.github/workflows/canonical.yml', import.meta.url), 'utf8')
  assert.match(workflow, /pnpm exec playwright test --reporter=json > "\$RUNNER_TEMP\/canonical-results\.json"/)
  assert.doesNotMatch(workflow, /pnpm test > "\$RUNNER_TEMP\/canonical-results\.json"/)
})

test('pins pnpm before installing the trusted runner from a nested checkout', () => {
  const workflow = readFileSync(new URL('../.github/workflows/canonical.yml', import.meta.url), 'utf8')
  assert.match(workflow, /uses: pnpm\/action-setup@[^\n]+\n\s+with:\n\s+version: '10\.34\.3'/)
})
