import { fileURLToPath } from 'node:url'
import { qaAppToken } from './app-token.mjs'
import { chooseApprovedSuite } from './proposal.mjs'
import { resolveSourceRun } from './resolve.mjs'

export const SOURCE = 'IgnisDevNE/CircuitoNE'
const QA = 'IgnisDevNE/CircuitoNE-QA'
export const SOURCE_REPOSITORY_ID = 1380574734

export function decideConclusion(expected, current, testResult) {
  const fields = ['sourceSha', 'sourceMainSha', 'sourcePr', 'runId', 'suiteSha', 'acceptedSha']
  return current.sourceCiConclusion === 'success' && testResult === 'success' &&
    fields.every((field) => expected[field] === current[field]) ? 'success' : 'failure'
}

export async function request(path, token, method = 'GET', body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10' },
    body: body && JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`GitHub API rejected QA publication (HTTP ${response.status})`)
  return response.status === 204 ? null : response.json()
}

async function currentAcceptance(expected, token) {
  const getJson = (path) => request(path, token)
  const source = await resolveSourceRun(expected.runId, 'accept', getJson)
  const accepted = await getJson(`/repos/${QA}/git/ref/heads/accepted`)
  const acceptedSha = accepted.object?.sha
  if (!/^[0-9a-f]{40,64}$/.test(acceptedSha || '')) throw new Error('Invalid accepted QA ref')
  const file = await getJson(`/repos/${QA}/contents/.qa/state.json?ref=${acceptedSha}`)
  const state = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'))
  if (state.source_main_sha !== source.sourceMainSha) throw new Error('QA state is behind source main')
  const proposal = await chooseApprovedSuite(source.sourcePr, acceptedSha, getJson)
  return { ...source, ...proposal, acceptedSha }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [runId, sourceSha, sourceMainSha, sourcePr, suiteSha, acceptedSha, testResult] = process.argv.slice(2)
    if (!/^[0-9a-f]{40,64}$/.test(sourceSha || '') || !/^[0-9a-f]{40,64}$/.test(sourceMainSha || '') ||
        !/^[0-9a-f]{40,64}$/.test(suiteSha || '') ||
        !/^[0-9a-f]{40,64}$/.test(acceptedSha || '') || !/^[1-9][0-9]*$/.test(runId || '') ||
        !/^[1-9][0-9]*$/.test(sourcePr || '')) throw new Error('Invalid QA publication input')
    const expected = { runId: Number(runId), sourceSha, sourceMainSha, sourcePr: Number(sourcePr), suiteSha, acceptedSha }
    let conclusion = 'failure'
    try {
      const current = await currentAcceptance(expected, process.env.GITHUB_TOKEN)
      conclusion = decideConclusion(expected, current, testResult)
    } catch (error) {
      console.error(`QA revalidation failed: ${error.message}`)
    }
    const token = await qaAppToken(SOURCE_REPOSITORY_ID, { checks: 'write' })
    await request(`/repos/${SOURCE}/check-runs`, token, 'POST', {
      name: 'canonical-acceptance', head_sha: sourceSha, status: 'completed', conclusion,
      details_url: process.env.QA_RUN_URL,
      external_id: `run=${runId};source=${sourceSha};suite=${suiteSha};accepted=${acceptedSha};workflow=${process.env.GITHUB_SHA}`,
      output: {
        title: conclusion === 'success' ? 'Canonical acceptance passed' : 'Canonical acceptance failed',
        summary: `Source PR #${sourcePr}; candidate ${sourceSha}; accepted suite ${acceptedSha}; tested suite ${suiteSha}; QA run ${process.env.GITHUB_RUN_ID}.`,
      },
    })
    console.log(`Independent canonical-acceptance check: ${conclusion}.`)
    if (conclusion !== 'success') process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
