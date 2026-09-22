import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { assertProposalOnlyTests } from './integrity.mjs'
import { chooseApprovedSuite } from './proposal.mjs'
import { resolveSourceRun } from './resolve.mjs'

const SOURCE = 'IgnisDevNE/CircuitoNE'
const QA = 'IgnisDevNE/CircuitoNE-QA'
const sha = (value) => typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value)
const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { stdio: 'pipe', encoding: 'utf8', maxBuffer: 1024 * 1024 }).trim()

function evidence(check) {
  const fields = Object.fromEntries(String(check.external_id || '').split(';').map((part) => part.split('=')))
  return fields
}

export function assertPromotionEvidence(expected, pr, reviews, checks, qaAppId, workflowSha) {
  if (pr.number !== expected.sourcePr || !pr.merged_at || pr.merge_commit_sha !== expected.sourceSha ||
      pr.base?.ref !== 'main' || !sha(pr.head?.sha)) throw new Error('Source PR merge does not match')
  const latest = reviews.filter((review) => review.user?.login === 'magalz').at(-1)
  if (latest?.state !== 'APPROVED' || latest.commit_id !== pr.head.sha) throw new Error('Source PR approval is missing or stale')
  const latestCheck = checks.filter((check) => check.name === 'canonical-acceptance' &&
    check.app?.id === qaAppId && check.head_sha === pr.head.sha && Number.isSafeInteger(check.id))
    .sort((a, b) => b.id - a.id)[0]
  const proof = evidence(latestCheck || {})
  const accepted = latestCheck?.status === 'completed' && latestCheck.conclusion === 'success' &&
    proof.source === pr.head.sha && proof.suite === expected.suiteSha &&
    proof.accepted === expected.acceptedSha && proof.workflow === workflowSha
  if (!accepted) throw new Error('Independent QA App check for exact suite and workflow is missing')
}

async function getJson(path, token) {
  const response = await fetch(`https://api.github.com${path}`, {
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2026-03-10' },
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`GitHub API rejected promotion lookup (HTTP ${response.status})`)
  return response.json()
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [acceptedDir, acceptedSha, suiteSha, sourceSha, sourceMainSha, sourcePrText, runId] = process.argv.slice(2)
    if (!acceptedDir || ![acceptedSha, suiteSha, sourceSha, sourceMainSha].every(sha) ||
        !/^[1-9][0-9]*$/.test(sourcePrText || '') || !/^[1-9][0-9]*$/.test(runId || '') ||
        !/^[1-9][0-9]*$/.test(process.env.QA_APP_ID || '') || !sha(process.env.GITHUB_SHA)) {
      throw new Error('Invalid promotion input')
    }
    const token = process.env.GITHUB_TOKEN
    if (!token) throw new Error('QA workflow token missing')
    const get = (path) => getJson(path, token)
    const expected = { acceptedSha, suiteSha, sourceSha, sourceMainSha, sourcePr: Number(sourcePrText), runId: Number(runId) }
    const current = await resolveSourceRun(runId, 'promote', get)
    if (current.sourceSha !== sourceSha || current.sourceMainSha !== sourceMainSha || current.sourcePr !== expected.sourcePr) {
      throw new Error('Source merge advanced during promotion')
    }
    if (git(acceptedDir, 'rev-parse', 'HEAD') !== acceptedSha) throw new Error('Accepted QA checkout changed')
    const state = JSON.parse(readFileSync(`${acceptedDir}/.qa/state.json`, 'utf8'))
    if (state.source_main_sha !== sourceMainSha) throw new Error('Promotion predecessor is not accepted')
    const proposal = await chooseApprovedSuite(expected.sourcePr, acceptedSha, get)
    if (proposal.suiteSha !== suiteSha) throw new Error('QA proposal changed during promotion')
    const pr = await get(`/repos/${SOURCE}/pulls/${expected.sourcePr}`)
    const reviews = await get(`/repos/${SOURCE}/pulls/${expected.sourcePr}/reviews?per_page=100`)
    const checkResult = await get(`/repos/${SOURCE}/commits/${pr.head.sha}/check-runs?check_name=canonical-acceptance&per_page=100`)
    assertPromotionEvidence(expected, pr, reviews, checkResult.check_runs ?? [], Number(process.env.QA_APP_ID), process.env.GITHUB_SHA)
    if (suiteSha !== acceptedSha) {
      git(acceptedDir, 'fetch', '--no-tags', 'origin', suiteSha)
      assertProposalOnlyTests(acceptedDir, acceptedSha, suiteSha)
      git(acceptedDir, 'rm', '-r', '-q', '--', 'tests/e2e')
      git(acceptedDir, 'checkout', suiteSha, '--', 'tests/e2e')
    }
    writeFileSync(`${acceptedDir}/.qa/state.json`, JSON.stringify({
      source_main_sha: sourceSha,
      promoted_source_pr: expected.sourcePr,
      promoted_suite_sha: suiteSha,
      previous_accepted_sha: acceptedSha,
      workflow_sha: process.env.GITHUB_SHA,
      source_run_id: expected.runId,
    }, null, 2) + '\n')
    git(acceptedDir, 'add', '--', '.qa/state.json')
    git(acceptedDir, '-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
      'commit', '-qm', `Promote CircuitoNE QA after PR #${expected.sourcePr}`)
    git(acceptedDir, 'push', 'origin', 'HEAD:accepted')
    console.log(`Promoted reviewed suite ${suiteSha} for source commit ${sourceSha}.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
