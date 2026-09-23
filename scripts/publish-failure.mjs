import { fileURLToPath } from 'node:url'
import { qaAppToken } from './app-token.mjs'
import { request, SOURCE, SOURCE_REPOSITORY_ID } from './publish.mjs'

const sha = (value) => typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value)

export function identifyFailedSource(runId, run, pulls) {
  // ponytail: Fail closed at one full API page; paginate if a commit reaches 100 associated PRs.
  if (!Array.isArray(pulls) || pulls.length >= 100) throw new Error('Incomplete source PR association page')
  if (run.id !== Number(runId) || run.name !== 'CI' || run.path !== '.github/workflows/ci.yml' ||
      run.event !== 'pull_request' || run.status !== 'completed' || !sha(run.head_sha) ||
      run.repository?.full_name !== SOURCE || run.head_repository?.full_name !== SOURCE ||
      !run.head_branch || !Number.isFinite(Date.parse(run.created_at)) || !Array.isArray(run.pull_requests)) {
    throw new Error('Not a trusted source PR CI run')
  }
  const matches = Array.isArray(pulls) && pulls.filter((pr) => pr.state === 'open' &&
    pr.head?.sha === run.head_sha && pr.head.ref === run.head_branch &&
    pr.head.repo?.full_name === SOURCE && pr.base?.ref === 'main' &&
    Number.isSafeInteger(pr.number) && Number.isFinite(Date.parse(pr.created_at)) &&
    Date.parse(pr.created_at) <= Date.parse(run.created_at) &&
    (!run.pull_requests.length || run.pull_requests.some((linked) => linked.number === pr.number)))
  if (matches?.length !== 1) throw new Error('No exact open source PR for failed QA run')
  return run.head_sha
}

export function failureCheck(sourceSha, runId, url) {
  return {
    name: 'canonical-acceptance', head_sha: sourceSha, status: 'completed', conclusion: 'failure',
    details_url: url, external_id: `run=${runId};source=${sourceSha};result=resolve-failed`,
    output: {
      title: 'Canonical acceptance could not start',
      summary: `QA could not resolve source CI run ${runId}. See the linked QA run for the error.`,
    },
  }
}

export async function reportFailedResolution(runId, url, getJson, createCheck) {
  if (!/^[1-9][0-9]*$/.test(runId || '')) throw new Error('Invalid source run ID')
  const run = await getJson(`/repos/${SOURCE}/actions/runs/${runId}`)
  if (!sha(run.head_sha)) throw new Error('Not a trusted source PR CI run')
  const pulls = await getJson(`/repos/${SOURCE}/commits/${run.head_sha}/pulls?per_page=100`)
  const sourceSha = identifyFailedSource(runId, run, pulls)
  await createCheck(failureCheck(sourceSha, runId, url))
  return sourceSha
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const sourceSha = await reportFailedResolution(process.argv[2], process.env.QA_RUN_URL,
      (path) => request(path, process.env.GITHUB_TOKEN),
      async (check) => {
        const token = await qaAppToken(SOURCE_REPOSITORY_ID, { checks: 'write' })
        await request(`/repos/${SOURCE}/check-runs`, token, 'POST', check)
      })
    console.error(`Independent canonical-acceptance check: failure for ${sourceSha}.`)
    process.exitCode = 1
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
