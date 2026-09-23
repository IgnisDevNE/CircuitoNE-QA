import { fileURLToPath } from 'node:url'

const QA = 'IgnisDevNE/CircuitoNE-QA'
const sha = (value) => typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value)

export async function closePromotedProposal(expected, getJson, patch) {
  if (![expected.sourcePr, expected.proposalPr].every((value) => Number.isSafeInteger(value) && value > 0) ||
      ![expected.sourceSha, expected.suiteSha, expected.acceptedSha].every(sha)) {
    throw new Error('Invalid promotion closure request')
  }
  const file = await getJson(`/repos/${QA}/contents/.qa/state.json?ref=accepted`)
  if (file?.encoding !== 'base64' || typeof file.content !== 'string') throw new Error('Invalid accepted promotion state')
  const state = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))
  if (state.source_main_sha !== expected.sourceSha || state.promoted_source_pr !== expected.sourcePr ||
      state.promoted_suite_sha !== expected.suiteSha || state.previous_accepted_sha !== expected.acceptedSha) {
    throw new Error('Accepted promotion does not match QA proposal')
  }
  const proposal = await getJson(`/repos/${QA}/pulls/${expected.proposalPr}`)
  if (proposal.number !== expected.proposalPr || !['open', 'closed'].includes(proposal.state) ||
      proposal.user?.login !== 'circuitone-qa-publisher[bot]' || proposal.base?.ref !== 'accepted' ||
      proposal.head?.repo?.full_name !== QA || proposal.head.ref !== `proposals/source-pr-${expected.sourcePr}` ||
      proposal.head.sha !== expected.suiteSha) {
    throw new Error('QA proposal changed after promotion')
  }
  if (proposal.state === 'open') await patch(`/repos/${QA}/pulls/${expected.proposalPr}`, { state: 'closed' })
}

async function request(path, method = 'GET', body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10' },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`GitHub rejected promoted QA proposal close (HTTP ${response.status})`)
  return response.json()
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    if (process.env.GITHUB_REPOSITORY !== QA || process.env.GITHUB_REF !== 'refs/heads/main' || !process.env.GITHUB_TOKEN) {
      throw new Error('QA closure must run from trusted main')
    }
    const [sourcePr, proposalPr, sourceSha, suiteSha, acceptedSha] = process.argv.slice(2)
    await closePromotedProposal({ sourcePr: Number(sourcePr), proposalPr: Number(proposalPr),
      sourceSha, suiteSha, acceptedSha }, (path) => request(path),
    (path, body) => request(path, 'PATCH', body))
    console.log(`Closed promoted QA proposal #${proposalPr}.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
