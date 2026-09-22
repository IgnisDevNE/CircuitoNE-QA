import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = 'tests/e2e/'

export function assertAcceptedState(repo, commit) {
  if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new Error('Invalid accepted commit SHA')
  const state = JSON.parse(execFileSync('git', ['-C', repo, 'show', `${commit}:.qa/state.json`], { encoding: 'utf8' }))
  if (!/^[0-9a-f]{40,64}$/.test(state.test_tree || '') ||
      execFileSync('git', ['-C', repo, 'rev-parse', `${commit}:tests/e2e`], { encoding: 'utf8' }).trim() !== state.test_tree) {
    throw new Error('Accepted test tree differs from the promotion record')
  }
  return state
}

function inventory(repo, commit) {
  if (!/^[0-9a-f]{40,64}$/.test(commit)) throw new Error('Invalid commit SHA')
  const output = execFileSync('git', ['-C', repo, 'ls-tree', '-r', '-z', '--full-tree', commit, '--', ROOT], {
    maxBuffer: 1024 * 1024,
  })
  const entries = output.toString('utf8').split('\0').filter(Boolean).map((entry) => {
    const match = /^(\d+) (\w+) ([0-9a-f]{40,64})\t(.+)$/.exec(entry)
    if (!match || match[1] !== '100644' || match[2] !== 'blob') {
      throw new Error('Canonical tests must contain regular files only')
    }
    return `${match[4]} ${match[3]}`
  }).sort()
  if (!entries.length) throw new Error('Canonical test tree is empty')
  return entries
}

export function assertCanonicalTests(candidateRepo, candidateCommit, qaRepo, qaCommit) {
  const candidate = inventory(candidateRepo, candidateCommit)
  const canonical = inventory(qaRepo, qaCommit)
  if (candidate.length !== canonical.length || candidate.some((entry, index) => entry !== canonical[index])) {
    throw new Error('Candidate canonical tests differ from the approved tree')
  }
  return candidate.length
}

export function needsProposal(candidateRepo, candidateCommit, qaRepo, acceptedCommit) {
  const candidate = inventory(candidateRepo, candidateCommit)
  const accepted = inventory(qaRepo, acceptedCommit)
  return candidate.length !== accepted.length || candidate.some((entry, index) => entry !== accepted[index])
}

export function assertCandidateIncludesBase(candidateRepo, baseCommit, candidateCommit) {
  if (!/^[0-9a-f]{40,64}$/.test(baseCommit) || !/^[0-9a-f]{40,64}$/.test(candidateCommit)) {
    throw new Error('Invalid source base SHA')
  }
  try {
    execFileSync('git', ['-C', candidateRepo, 'merge-base', '--is-ancestor', baseCommit, candidateCommit], { stdio: 'pipe' })
  } catch {
    throw new Error('Candidate does not include the current source base')
  }
}

export function assertProposalOnlyTests(qaRepo, acceptedCommit, proposalCommit) {
  if (!/^[0-9a-f]{40,64}$/.test(acceptedCommit) || !/^[0-9a-f]{40,64}$/.test(proposalCommit)) {
    throw new Error('Invalid QA commit SHA')
  }
  try {
    execFileSync('git', ['-C', qaRepo, 'merge-base', '--is-ancestor', acceptedCommit, proposalCommit], { stdio: 'pipe' })
  } catch {
    throw new Error('QA proposal does not descend from the accepted suite')
  }
  const paths = execFileSync('git', ['-C', qaRepo, 'diff', '--name-only', '--no-renames', '-z', acceptedCommit, proposalCommit], {
    maxBuffer: 1024 * 1024,
  }).toString('utf8').split('\0').filter(Boolean)
  if (!paths.length || paths.some((path) => !path.startsWith(ROOT))) {
    throw new Error('QA proposal changes the runner or files outside canonical tests')
  }
  inventory(qaRepo, proposalCommit)
  return paths.length
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [candidateRepo, candidateCommit, qaRepo, qaCommit, acceptedCommit, sourceMainCommit] = process.argv.slice(2)
    if (!candidateRepo || !candidateCommit || !qaRepo || !qaCommit) throw new Error('Usage: integrity.mjs candidate-repo candidate-sha qa-repo qa-sha')
    if (sourceMainCommit) assertCandidateIncludesBase(candidateRepo, sourceMainCommit, candidateCommit)
    if (acceptedCommit && acceptedCommit !== qaCommit) assertProposalOnlyTests(qaRepo, acceptedCommit, qaCommit)
    console.log(`Canonical test tree verified (${assertCanonicalTests(candidateRepo, candidateCommit, qaRepo, qaCommit)} files).`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
