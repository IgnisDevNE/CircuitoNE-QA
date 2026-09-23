import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveSourceRun } from './resolve.mjs'

const QA = 'IgnisDevNE/CircuitoNE-QA'
const SOURCE = 'IgnisDevNE/CircuitoNE'
const sha = (value) => typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value)

export async function resumeAfterApproval(event, getJson, dispatch) {
  const review = event?.review
  const proposalNumber = event?.pull_request?.number
  if (event?.action !== 'submitted' || review?.state !== 'approved' ||
      review.user?.login !== 'magalz' || !Number.isSafeInteger(review.id) ||
      !Number.isSafeInteger(proposalNumber) || proposalNumber < 1 || !sha(review.commit_id)) {
    throw new Error('Untrusted QA approval event')
  }
  const proposal = await getJson(`/repos/${QA}/pulls/${proposalNumber}`)
  const match = /^proposals\/source-pr-([1-9][0-9]*)$/.exec(proposal.head?.ref || '')
  if (proposal.number !== proposalNumber || proposal.state !== 'open' || proposal.draft ||
      proposal.user?.login !== 'circuitone-qa-publisher[bot]' || proposal.base?.ref !== 'accepted' ||
      proposal.head?.repo?.full_name !== QA || !match || proposal.head.sha !== review.commit_id) {
    throw new Error('QA proposal is not the current trusted proposal')
  }
  const reviews = await getJson(`/repos/${QA}/pulls/${proposalNumber}/reviews?per_page=100`)
  const latest = Array.isArray(reviews) ? reviews.filter((item) => item.user?.login === 'magalz').at(-1) : null
  if (latest?.id !== review.id || latest.state !== 'APPROVED' || latest.commit_id !== proposal.head.sha) {
    throw new Error('QA review is stale or superseded')
  }
  const sourcePr = Number(match[1])
  const source = await getJson(`/repos/${SOURCE}/pulls/${sourcePr}`)
  if (source.number !== sourcePr || source.state !== 'open' || source.base?.ref !== 'main' ||
      source.head?.repo?.full_name !== SOURCE || !sha(source.head.sha)) {
    throw new Error('Source PR is not eligible')
  }
  const runs = await getJson(`/repos/${SOURCE}/actions/workflows/ci.yml/runs?event=pull_request&head_sha=${source.head.sha}&status=completed&per_page=100`)
  const latestRun = Array.isArray(runs?.workflow_runs) ? runs.workflow_runs
    .filter((item) => Number.isSafeInteger(item.id)).sort((a, b) => b.id - a.id)[0] : null
  if (!latestRun || latestRun.conclusion !== 'success') throw new Error('No latest successful CI for source PR')
  const resolved = await resolveSourceRun(latestRun.id, 'accept', getJson)
  if (resolved.sourcePr !== sourcePr || resolved.sourceSha !== source.head.sha || resolved.sourceCiConclusion !== 'success') {
    throw new Error('Source CI does not match the current PR')
  }
  await dispatch(latestRun.id)
  return latestRun.id
}

async function request(path, method = 'GET', body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10' },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`GitHub rejected QA resume (HTTP ${response.status})`)
  return response.status === 204 ? null : response.json()
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.env.GITHUB_REPOSITORY !== QA || !process.env.GITHUB_TOKEN || !process.env.GITHUB_EVENT_PATH) {
      throw new Error('QA review workflow context missing')
    }
    const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
    const id = await resumeAfterApproval(event, (path) => request(path),
      (runId) => request(`/repos/${QA}/actions/workflows/canonical.yml/dispatches`, 'POST',
        { ref: 'main', inputs: { source_run_id: String(runId), mode: 'accept' } }))
    console.log(`Dispatched canonical acceptance for source CI run ${id}.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
