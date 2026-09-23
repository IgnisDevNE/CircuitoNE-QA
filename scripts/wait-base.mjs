import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { assertAcceptedState } from './integrity.mjs'
import { resolveSourceRun } from './resolve.mjs'

const sha = (value) => typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value)

export async function waitForAcceptedBase(sourceMainSha, readAccepted, revalidate, sleep, attempts = 24) {
  if (!sha(sourceMainSha) || !Number.isSafeInteger(attempts) || attempts < 1) throw new Error('Invalid base wait')
  let initial
  for (let attempt = 0; attempt < attempts; attempt++) {
    const accepted = await readAccepted()
    if (!sha(accepted.sha) || !sha(accepted.sourceMainSha)) throw new Error('Invalid accepted QA state')
    if (accepted.sourceMainSha === sourceMainSha) {
      await revalidate()
      return accepted.sha
    }
    if (initial && accepted.sourceMainSha !== initial) throw new Error('QA promoted a different source commit')
    initial = accepted.sourceMainSha
    if (attempt === 0) console.log(`Awaiting QA promotion of source base ${sourceMainSha}; accepted still records ${initial}.`)
    if (attempt + 1 < attempts) await sleep()
  }
  throw new Error(`Timed out waiting for QA promotion of source base ${sourceMainSha}`)
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    const [runId, sourceSha, sourceMainSha, sourcePr, acceptedDir] = process.argv.slice(2)
    if (!/^[1-9][0-9]*$/.test(runId || '') || !/^[1-9][0-9]*$/.test(sourcePr || '') ||
        !sha(sourceSha) || !sha(sourceMainSha) || !acceptedDir || !process.env.GITHUB_TOKEN) {
      throw new Error('Invalid base wait request')
    }
    const getJson = async (path) => {
      const response = await fetch(`https://api.github.com${path}`, {
        headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2026-03-10' },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error(`GitHub API rejected source revalidation (HTTP ${response.status})`)
      return response.json()
    }
    const readAccepted = async () => {
      execFileSync('git', ['-C', acceptedDir, 'fetch', '--no-tags', 'origin', 'accepted'], { stdio: 'pipe' })
      const currentSha = execFileSync('git', ['-C', acceptedDir, 'rev-parse', 'FETCH_HEAD'], { encoding: 'utf8' }).trim()
      const state = assertAcceptedState(acceptedDir, currentSha)
      return { sha: currentSha, sourceMainSha: state.source_main_sha }
    }
    const revalidate = async () => {
      const current = await resolveSourceRun(runId, 'accept', getJson)
      if (current.sourceSha !== sourceSha || current.sourceMainSha !== sourceMainSha ||
          current.sourcePr !== Number(sourcePr)) throw new Error('Source PR changed while awaiting QA promotion')
    }
    const acceptedSha = await waitForAcceptedBase(sourceMainSha, readAccepted, revalidate,
      () => new Promise((resolve) => setTimeout(resolve, 10_000)))
    execFileSync('git', ['-C', acceptedDir, 'reset', '--hard', acceptedSha], { stdio: 'pipe' })
    console.log(`QA accepted base ${sourceMainSha} at ${acceptedSha}.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
