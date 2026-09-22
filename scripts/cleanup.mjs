import { fileURLToPath } from 'node:url'

const QA = 'IgnisDevNE/CircuitoNE-QA'
const temporary = (ref) => /^codex\/[A-Za-z0-9._/-]+$/.test(ref) || /^proposals\/source-pr-[1-9][0-9]*$/.test(ref)
const sha = (value) => typeof value === 'string' && /^[0-9a-f]{40,64}$/.test(value)

export async function cleanupClosedBranches(send) {
  const removed = []
  for (let page = 1; page <= 100; page++) {
    const pulls = await send('GET', `/repos/${QA}/pulls?state=closed&per_page=100&page=${page}`)
    if (!Array.isArray(pulls)) throw new Error('Invalid closed PR list')
    for (const pr of pulls) {
      const ref = pr.head?.ref
      if (pr.state !== 'closed' || pr.head?.repo?.full_name !== QA || pr.base?.repo?.full_name !== QA ||
          !['main', 'accepted'].includes(pr.base.ref) || !temporary(ref) || !sha(pr.head.sha)) continue
      const open = await send('GET', `/repos/${QA}/pulls?state=open&head=IgnisDevNE%3A${encodeURIComponent(ref)}&per_page=1`)
      if (!Array.isArray(open)) throw new Error('Invalid open PR list')
      if (open.length) continue
      const path = `/repos/${QA}/git/refs/heads/${ref}`
      const current = await send('GET', path.replace('/git/refs/', '/git/ref/'))
      if (!current || current.object?.sha !== pr.head.sha) continue
      // ponytail: GitHub has no conditional ref deletion; recover manually if a branch is reused in this narrow window.
      await send('DELETE', path)
      removed.push(ref)
    }
    if (pulls.length < 100) return removed
  }
  throw new Error('Closed PR scan exceeded 100 pages')
}

async function request(method, path) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'X-GitHub-Api-Version': '2026-03-10' },
    signal: AbortSignal.timeout(15000),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new Error(`GitHub QA cleanup failed (HTTP ${response.status})`)
  return response.status === 204 ? null : response.json()
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (!process.env.GITHUB_TOKEN || process.env.GITHUB_REPOSITORY !== QA || process.env.GITHUB_REF !== 'refs/heads/main') {
    throw new Error('QA cleanup must run from trusted main')
  }
  console.log(`Removed QA branches: ${(await cleanupClosedBranches(request)).join(', ') || '(none)'}`)
}
