import { appendFileSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const QA = 'IgnisDevNE/CircuitoNE-QA'
const sha = (value) => typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value)

export async function chooseApprovedSuite(sourcePr, acceptedSha, getJson) {
  if (!Number.isSafeInteger(sourcePr) || sourcePr < 1 || !sha(acceptedSha)) throw new Error('Invalid suite request')
  const branch = `proposals/source-pr-${sourcePr}`
  const pulls = await getJson(`/repos/${QA}/pulls?state=open&base=accepted&head=IgnisDevNE:${encodeURIComponent(branch)}&per_page=100`)
  if (!Array.isArray(pulls)) throw new Error('Invalid QA proposals')
  const matches = pulls.filter((pr) => pr.state === 'open' && !pr.draft && pr.base?.ref === 'accepted' &&
    pr.head?.ref === branch && pr.head.repo?.full_name === QA && sha(pr.head.sha) && Number.isSafeInteger(pr.number))
  if (matches.length > 1) throw new Error('Ambiguous QA proposal')
  if (!matches.length) return { suiteSha: acceptedSha, proposalPr: null }
  const proposal = matches[0]
  const reviews = await getJson(`/repos/${QA}/pulls/${proposal.number}/reviews?per_page=100`)
  if (!Array.isArray(reviews)) throw new Error('Invalid QA reviews')
  const latest = reviews.filter((review) => review.user?.login === 'magalz').at(-1)
  if (latest?.state !== 'APPROVED' || latest.commit_id !== proposal.head.sha) {
    throw new Error('QA proposal is not approved at its current SHA')
  }
  return { suiteSha: proposal.head.sha, proposalPr: proposal.number }
}

export function acceptedState(state, mode, sourceSha, sourceMainSha, sourcePr) {
  if (state.source_main_sha === sourceMainSha) return { alreadyPromoted: false }
  if (mode === 'promote' && state.source_main_sha === sourceSha) {
    if (state.promoted_source_pr !== sourcePr) throw new Error('Current source main was promoted for a different PR')
    return { alreadyPromoted: true }
  }
  throw new Error('Source main has advanced beyond the promoted QA state')
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [sourcePrText, sourceMainSha, acceptedSha, acceptedDir, mode, sourceSha] = process.argv.slice(2)
    const token = process.env.GITHUB_TOKEN
    if (!token || !process.env.GITHUB_OUTPUT || !acceptedDir) throw new Error('QA workflow context missing')
    const state = JSON.parse(readFileSync(`${acceptedDir}/.qa/state.json`, 'utf8'))
    if (!sha(sourceMainSha) || !sha(sourceSha)) throw new Error('Invalid source SHA')
    const status = acceptedState(state, mode, sourceSha, sourceMainSha, Number(sourcePrText))
    const getJson = async (path) => {
      const response = await fetch(`https://api.github.com${path}`, {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2026-03-10' },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error(`GitHub API rejected QA lookup (HTTP ${response.status})`)
      return response.json()
    }
    const result = status.alreadyPromoted
      ? { suiteSha: acceptedSha, proposalPr: null }
      : await chooseApprovedSuite(Number(sourcePrText), acceptedSha, getJson)
    for (const [name, value] of Object.entries(result)) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value ?? ''}\n`)
    appendFileSync(process.env.GITHUB_OUTPUT, `alreadyPromoted=${status.alreadyPromoted}\n`)
    console.log(`Resolved approved QA suite ${result.suiteSha}.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
