import { appendFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const SOURCE = 'IgnisDevNE/CircuitoNE'
const sha = (value) => typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value)

export async function resolveSourceRun(runId, mode, getJson) {
  if (!/^[1-9][0-9]*$/.test(String(runId)) || !['accept', 'promote'].includes(mode)) {
    throw new Error('Invalid source run request')
  }
  const run = await getJson(`/repos/${SOURCE}/actions/runs/${runId}`)
  if (run.id !== Number(runId) || run.name !== 'CI' || run.path !== '.github/workflows/ci.yml' ||
      run.status !== 'completed' || !sha(run.head_sha) ||
      run.repository?.full_name !== SOURCE || run.head_repository?.full_name !== SOURCE) {
    throw new Error('Source run is not trusted CI')
  }
  if (!['success', 'failure'].includes(run.conclusion)) throw new Error('Source CI has no usable result')
  const main = (await getJson(`/repos/${SOURCE}/branches/main`)).commit?.sha
  if (!sha(main)) throw new Error('Invalid source main')

  const pulls = await getJson(`/repos/${SOURCE}/commits/${run.head_sha}/pulls`)
  if (!Array.isArray(pulls)) throw new Error('Invalid source pull request list')
  if (mode === 'accept') {
    if (run.event !== 'pull_request') throw new Error('Wrong source event')
    const matches = pulls.filter((pr) => pr.state === 'open' && pr.head?.sha === run.head_sha &&
      pr.head.repo?.full_name === SOURCE && pr.base?.ref === 'main' && Number.isSafeInteger(pr.number))
    if (matches.length !== 1) throw new Error('No exact open PR for source SHA')
    if (matches[0].base.sha !== main) throw new Error('Source PR base advanced')
    return { mode, sourceSha: run.head_sha, sourceMainSha: main, sourcePr: matches[0].number, runId: run.id, sourceCiConclusion: run.conclusion }
  }

  if (run.event !== 'push' || run.head_branch !== 'main' || run.conclusion !== 'success') {
    throw new Error('Promotion requires successful main CI')
  }
  if (run.head_sha !== main) throw new Error('Source main advanced before promotion')
  const matches = pulls.filter((pr) => pr.state === 'closed' && pr.merged_at &&
    pr.merge_commit_sha === run.head_sha && pr.base?.ref === 'main' && Number.isSafeInteger(pr.number))
  if (matches.length !== 1) throw new Error('No exact merged PR for source SHA')
  const commit = await getJson(`/repos/${SOURCE}/commits/${run.head_sha}`)
  const previousMain = commit.parents?.[0]?.sha
  if (!sha(previousMain)) throw new Error('Source commit has no prior main')
  return { mode, sourceSha: run.head_sha, sourceMainSha: previousMain, sourcePr: matches[0].number, runId: run.id, sourceCiConclusion: run.conclusion }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const token = process.env.GITHUB_TOKEN
    if (!token || !process.env.GITHUB_OUTPUT) throw new Error('QA workflow context missing')
    const getJson = async (path) => {
      const response = await fetch(`https://api.github.com${path}`, {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2026-03-10' },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error(`GitHub API rejected source lookup (HTTP ${response.status})`)
      return response.json()
    }
    const result = await resolveSourceRun(process.argv[2], process.argv[3], getJson)
    for (const [name, value] of Object.entries(result)) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`)
    console.log(`Resolved ${result.mode} for source PR #${result.sourcePr} at ${result.sourceSha}.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
