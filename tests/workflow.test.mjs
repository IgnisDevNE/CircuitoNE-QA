import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const yaml = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('runs Playwright directly so the result file contains only JSON', () => {
  const workflow = yaml('../.github/workflows/canonical.yml')
  assert.match(workflow, /pnpm exec playwright test --reporter=json > "\$RUNNER_TEMP\/canonical-results\.json"/)
  assert.doesNotMatch(workflow, /pnpm test > "\$RUNNER_TEMP\/canonical-results\.json"/)
})

test('pins pnpm before installing the trusted runner from a nested checkout', () => {
  const workflow = yaml('../.github/workflows/canonical.yml')
  assert.match(workflow, /uses: pnpm\/action-setup@[^\n]+\n\s+with:\n\s+version: '10\.34\.3'/)
})

test('runs the SSR candidate on its fixed Node port', () => {
  const workflow = yaml('../.github/workflows/canonical.yml')
  assert.match(workflow, /--env CIRCUITONE_RUNTIME=preview -p 127\.0\.0\.1:5182:3000 circuitone-candidate/)
})

test('prints canonical report diagnostics and preserves the browser runner exit status', () => {
  const workflow = yaml('../.github/workflows/canonical.yml')
  assert.match(workflow, /status=\$\?\n\s+set -e\n\s+node scripts\/results\.mjs "\$RUNNER_TEMP\/canonical-results\.json"\n\s+exit "\$status"/)
})

test('reports a failed QA resolution as a negative check on the source commit', () => {
  const workflow = yaml('../.github/workflows/canonical.yml')
  assert.match(workflow, /Resolve trusted source event[\s\S]*Await exact source base promotion[\s\S]*Pin accepted suite[\s\S]*Stage changed tests as a QA proposal/)
  assert.match(workflow, /node runner\/scripts\/wait-base\.mjs/)
  assert.match(workflow, /always\(\) && inputs\.mode == 'accept'/)
  assert.doesNotMatch(workflow, /always\(\) && inputs\.mode == 'accept' && needs\.resolve\.result == 'success'/)
  assert.match(workflow, /SOURCE_RUN_ID: \$\{\{ inputs\.source_run_id \}\}/)
  assert.match(workflow, /node runner\/scripts\/publish-failure\.mjs "\$SOURCE_RUN_ID"/)
  assert.doesNotMatch(workflow, /run: node runner\/scripts\/resolve\.mjs '\$\{\{ inputs\.source_run_id \}\}'/)
})

test('approval workflow runs trusted main with no secrets and dispatches canonical acceptance', () => {
  const workflow = yaml('../.github/workflows/resume-on-approval.yml')
  assert.match(workflow, /pull_request_review:\s*\n\s*types: \[submitted\]/)
  assert.match(workflow, /github\.event\.review\.state == 'approved'/)
  assert.match(workflow, /github\.event\.pull_request\.base\.ref == 'accepted'/)
  assert.match(workflow, /startsWith\(github\.event\.pull_request\.head\.ref, 'proposals\/source-pr-'\)/)
  assert.match(workflow, /actions: write/)
  assert.match(workflow, /ref: main/)
  assert.match(workflow, /persist-credentials: false/)
  assert.match(workflow, /node scripts\/resume\.mjs/)
  assert.doesNotMatch(workflow, /secrets\./)
})

test('promotion closes its exact proposal only after promotion succeeds', () => {
  const workflow = yaml('../.github/workflows/canonical.yml')
  assert.match(workflow, /close-proposal:\n\s+if: \$\{\{ inputs\.mode == 'promote' && needs\.promote\.result == 'success' && needs\.resolve\.outputs\.proposalPr != '' \}\}/)
  assert.match(workflow.split('close-proposal:')[1], /ref: \$\{\{ github\.sha \}\}/)
  assert.match(workflow, /pull-requests: write[\s\S]*node runner\/scripts\/close-promoted\.mjs/)
  assert.doesNotMatch(workflow.split('close-proposal:')[1], /secrets\./)
})

test('promotion uses only the QA-scoped promoter App to write accepted', () => {
  const promote = yaml('../.github/workflows/canonical.yml').split('\n  promote:')[1]?.split('\n  close-proposal:')[0]
  assert.ok(promote)
  assert.match(promote, /environment: QA Promotion/)
  assert.match(promote, /contents: read/)
  assert.doesNotMatch(promote, /^\s+contents: write$/m)
  assert.match(promote, /uses: actions\/create-github-app-token@[0-9a-f]{40}/)
  assert.match(promote, /repositories: CircuitoNE-QA/)
  assert.match(promote, /permission-contents: write/)
  assert.match(promote, /token: \$\{\{ steps\.promoter-token\.outputs\.token \}\}/)
  assert.match(promote, /QA_PROMOTER_PRIVATE_KEY/)
  assert.doesNotMatch(promote, /QA_APP_PRIVATE_KEY/)
})
