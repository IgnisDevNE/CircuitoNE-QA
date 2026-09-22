import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { assertCanonicalTests, assertCandidateIncludesBase, assertProposalOnlyTests, needsProposal } from '../scripts/integrity.mjs'
import { proposalNeedsRefresh } from '../scripts/stage.mjs'

const git = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'pipe' }).toString().trim()

function repository(files) {
  const root = mkdtempSync(join(tmpdir(), 'circuitone-qa-test-'))
  git(root, 'init', '-q')
  git(root, 'config', 'user.name', 'QA Test')
  git(root, 'config', 'user.email', 'qa@example.invalid')
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  git(root, 'add', '.')
  git(root, 'commit', '-qm', 'fixture')
  return { root, sha: git(root, 'rev-parse', 'HEAD') }
}

test('accepts only the exact canonical test tree, including filenames', () => {
  const qa = repository({ 'tests/e2e/rule.spec.ts': 'expect(true).toBe(true)\n' })
  const candidate = repository({ 'tests/e2e/rule.spec.ts': 'expect(true).toBe(true)\n' })
  try {
    assert.doesNotThrow(() => assertCanonicalTests(candidate.root, candidate.sha, qa.root, qa.sha))
    writeFileSync(join(candidate.root, 'tests/e2e/rule.spec.ts'), 'expect(false).toBe(true)\n')
    git(candidate.root, 'add', '.')
    git(candidate.root, 'commit', '-qm', 'weaken test')
    assert.throws(() => assertCanonicalTests(candidate.root, git(candidate.root, 'rev-parse', 'HEAD'), qa.root, qa.sha), /canonical/i)
    writeFileSync(join(candidate.root, 'tests/e2e/extra.spec.ts'), 'test.skip()\n')
    git(candidate.root, 'add', '.')
    git(candidate.root, 'commit', '-qm', 'extra test')
    assert.throws(() => assertCanonicalTests(candidate.root, git(candidate.root, 'rev-parse', 'HEAD'), qa.root, qa.sha), /canonical/i)
  } finally {
    rmSync(qa.root, { recursive: true, force: true })
    rmSync(candidate.root, { recursive: true, force: true })
  }
})

test('rejects a symlink in the protected test tree', () => {
  const qa = repository({ 'tests/e2e/rule.spec.ts': 'test()\n' })
  const candidate = repository({ 'tests/e2e/rule.spec.ts': 'test()\n' })
  try {
    rmSync(join(candidate.root, 'tests/e2e/rule.spec.ts'))
    writeFileSync(join(candidate.root, 'outside.ts'), 'test()\n')
    git(candidate.root, 'add', '.')
    git(candidate.root, 'commit', '-qm', 'outside')
    // Git tree entries must be regular files; a platform-specific symlink is
    // represented directly to keep this check portable on Windows.
    git(candidate.root, 'update-index', '--add', '--cacheinfo', '120000', git(candidate.root, 'hash-object', '-w', 'outside.ts'), 'tests/e2e/rule.spec.ts')
    git(candidate.root, 'commit', '-qm', 'symlink')
    assert.throws(() => assertCanonicalTests(candidate.root, git(candidate.root, 'rev-parse', 'HEAD'), qa.root, qa.sha), /regular file/i)
  } finally {
    rmSync(qa.root, { recursive: true, force: true })
    rmSync(candidate.root, { recursive: true, force: true })
  }
})

test('a QA proposal may change tests but not its trusted runner', () => {
  const qa = repository({ 'tests/e2e/rule.spec.ts': 'test()\n', 'scripts/runner.mjs': 'trusted\n' })
  try {
    writeFileSync(join(qa.root, 'tests/e2e/rule.spec.ts'), 'test("new")\n')
    git(qa.root, 'add', '.')
    git(qa.root, 'commit', '-qm', 'new acceptance test')
    const proposal = git(qa.root, 'rev-parse', 'HEAD')
    assert.doesNotThrow(() => assertProposalOnlyTests(qa.root, qa.sha, proposal))
    writeFileSync(join(qa.root, 'scripts/runner.mjs'), 'untrusted\n')
    git(qa.root, 'add', '.')
    git(qa.root, 'commit', '-qm', 'change runner')
    assert.throws(() => assertProposalOnlyTests(qa.root, qa.sha, git(qa.root, 'rev-parse', 'HEAD')), /runner|outside/i)
  } finally {
    rmSync(qa.root, { recursive: true, force: true })
  }
})

test('stages a proposal only when the candidate test tree differs', () => {
  const qa = repository({ 'tests/e2e/rule.spec.ts': 'old\n' })
  const candidate = repository({ 'tests/e2e/rule.spec.ts': 'old\n' })
  try {
    assert.equal(needsProposal(candidate.root, candidate.sha, qa.root, qa.sha), false)
    writeFileSync(join(candidate.root, 'tests/e2e/rule.spec.ts'), 'new\n')
    git(candidate.root, 'add', '.')
    git(candidate.root, 'commit', '-qm', 'new test')
    assert.equal(needsProposal(candidate.root, git(candidate.root, 'rev-parse', 'HEAD'), qa.root, qa.sha), true)
  } finally {
    rmSync(qa.root, { recursive: true, force: true })
    rmSync(candidate.root, { recursive: true, force: true })
  }
})

test('candidate must include the current source main commit', () => {
  const candidate = repository({ 'tests/e2e/rule.spec.ts': 'old\n' })
  const unrelated = repository({ 'tests/e2e/rule.spec.ts': 'other\n' })
  try {
    writeFileSync(join(candidate.root, 'tests/e2e/rule.spec.ts'), 'new\n')
    git(candidate.root, 'add', '.')
    git(candidate.root, 'commit', '-qm', 'candidate')
    assert.doesNotThrow(() => assertCandidateIncludesBase(candidate.root, candidate.sha, git(candidate.root, 'rev-parse', 'HEAD')))
    assert.throws(() => assertCandidateIncludesBase(candidate.root, unrelated.sha, git(candidate.root, 'rev-parse', 'HEAD')), /base/i)
  } finally {
    rmSync(candidate.root, { recursive: true, force: true })
    rmSync(unrelated.root, { recursive: true, force: true })
  }
})

test('refreshes a proposal whose base is no longer the accepted suite', () => {
  const qa = repository({ 'tests/e2e/rule.spec.ts': 'old\n' })
  const candidate = repository({ 'tests/e2e/rule.spec.ts': 'new\n' })
  try {
    writeFileSync(join(qa.root, 'tests/e2e/rule.spec.ts'), 'new\n')
    git(qa.root, 'add', '.')
    git(qa.root, 'commit', '-qm', 'proposal')
    const previous = git(qa.root, 'rev-parse', 'HEAD')
    git(qa.root, 'switch', '-q', '--detach', qa.sha)
    writeFileSync(join(qa.root, '.qa-state'), 'advanced\n')
    git(qa.root, 'add', '.')
    git(qa.root, 'commit', '-qm', 'accepted advanced')
    const accepted = git(qa.root, 'rev-parse', 'HEAD')
    assert.equal(proposalNeedsRefresh(candidate.root, candidate.sha, qa.root, accepted, previous), true)
  } finally {
    rmSync(qa.root, { recursive: true, force: true })
    rmSync(candidate.root, { recursive: true, force: true })
  }
})
