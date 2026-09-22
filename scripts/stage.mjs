import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { qaAppToken } from './app-token.mjs'
import { needsProposal } from './integrity.mjs'

const QA = 'IgnisDevNE/CircuitoNE-QA'
const QA_REPOSITORY_ID = 1382208661
const sha = (value) => typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value)
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { stdio: 'pipe', encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim()

async function request(path, token, method = 'GET', body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10' },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`GitHub API rejected QA proposal (HTTP ${response.status})`)
  return response.json()
}

export async function closeObsoleteProposal(sourcePr, send) {
  const branch = `proposals/source-pr-${sourcePr}`
  const pulls = await send(`/repos/${QA}/pulls?state=open&base=accepted&head=IgnisDevNE:${encodeURIComponent(branch)}&per_page=100`, 'GET')
  if (!Array.isArray(pulls)) throw new Error('Invalid QA proposal list')
  for (const pr of pulls) {
    if (pr.state === 'open' && pr.head?.ref === branch && pr.head.repo?.full_name === QA && Number.isSafeInteger(pr.number)) {
      await send(`/repos/${QA}/pulls/${pr.number}`, 'PATCH', { state: 'closed' })
    }
  }
}

export async function ensureProposal(sourcePr, sourceSha, acceptedSha, send) {
  const branch = `proposals/source-pr-${sourcePr}`
  const pulls = await send(`/repos/${QA}/pulls?state=open&base=accepted&head=IgnisDevNE:${encodeURIComponent(branch)}&per_page=100`, 'GET')
  if (!Array.isArray(pulls)) throw new Error('Invalid QA proposal list')
  const existing = pulls.find((pr) => pr.state === 'open' && pr.head?.ref === branch &&
    pr.head.repo?.full_name === QA && pr.base?.ref === 'accepted')
  if (existing) {
    if (existing.user?.login !== 'circuitone-qa-publisher[bot]') throw new Error('QA proposal must be opened by the QA App')
    return existing.html_url
  }
  const created = await send(`/repos/${QA}/pulls`, 'POST', {
    title: `Canonical tests for CircuitoNE #${sourcePr}`,
    head: branch,
    base: 'accepted',
    body: `Source PR: https://github.com/IgnisDevNE/CircuitoNE/pull/${sourcePr}\nSource commit: ${sourceSha}\nAccepted suite: ${acceptedSha}\n\nReview the test changes and approve this QA PR before rerunning source CI.`,
  })
  if (typeof created?.html_url !== 'string') throw new Error('Invalid QA proposal response')
  return created.html_url
}

export function proposalNeedsRefresh(candidateDir, candidateSha, acceptedDir, acceptedSha, previousSha) {
  try {
    git(acceptedDir, 'merge-base', '--is-ancestor', acceptedSha, previousSha)
  } catch {
    return true
  }
  return needsProposal(candidateDir, candidateSha, acceptedDir, previousSha)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [acceptedDir, acceptedSha, candidateDir, candidateSha, sourcePrText] = process.argv.slice(2)
    const token = process.env.GITHUB_TOKEN
    if (!acceptedDir || !candidateDir || !sha(acceptedSha) || !sha(candidateSha) ||
        !/^[1-9][0-9]*$/.test(sourcePrText || '') || !token) throw new Error('Invalid QA staging input')
    if (git(acceptedDir, 'rev-parse', 'HEAD') !== acceptedSha) throw new Error('Accepted QA checkout changed')
    if (!needsProposal(candidateDir, candidateSha, acceptedDir, acceptedSha)) {
      await closeObsoleteProposal(Number(sourcePrText), (path, method, body) => request(path, token, method, body))
      console.log('Candidate uses the accepted test tree; no proposal needed.')
      process.exit(0)
    }
    const branch = `proposals/source-pr-${sourcePrText}`
    const ref = `refs/heads/${branch}`
    const remote = git(acceptedDir, 'ls-remote', 'origin', ref)
    const previous = remote ? remote.split(/\s/)[0] : null
    if (previous && !sha(previous)) throw new Error('Invalid QA proposal ref')
    let changed = true
    if (previous) {
      git(acceptedDir, 'fetch', '--no-tags', 'origin', previous)
      changed = proposalNeedsRefresh(candidateDir, candidateSha, acceptedDir, acceptedSha, previous)
    }
    if (changed) {
      git(acceptedDir, 'switch', '-C', branch, acceptedSha)
      git(acceptedDir, 'fetch', '--no-tags', 'https://github.com/IgnisDevNE/CircuitoNE.git', candidateSha)
      git(acceptedDir, 'rm', '-r', '-q', '--', 'tests/e2e')
      git(acceptedDir, 'checkout', candidateSha, '--', 'tests/e2e')
      git(acceptedDir, '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
        'commit', '-qm', `Propose canonical tests for CircuitoNE #${sourcePrText}`)
      if (previous) {
        git(acceptedDir, 'push', 'origin', `HEAD:${ref}`, `--force-with-lease=${ref}:${previous}`)
      } else {
        git(acceptedDir, 'push', 'origin', `HEAD:${ref}`)
      }
    }
    const appToken = await qaAppToken(QA_REPOSITORY_ID, { pull_requests: 'write' })
    const proposalUrl = await ensureProposal(Number(sourcePrText), candidateSha, acceptedSha,
      (path, method, body) => request(path, appToken, method, body))
    console.log(`QA proposal for source PR #${sourcePrText}: ${proposalUrl}`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
