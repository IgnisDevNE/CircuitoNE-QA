import { sign } from 'node:crypto'

async function request(path, token, method, body) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2026-03-10' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  })
  if (!response.ok) throw new Error(`GitHub rejected QA App token request (HTTP ${response.status})`)
  return response.json()
}

export async function qaAppToken(repositoryId, permissions, credentials = process.env, send = request) {
  const { QA_APP_ID, QA_APP_INSTALLATION_ID, QA_APP_PRIVATE_KEY } = credentials
  if (!/^[1-9][0-9]*$/.test(QA_APP_ID || '') || !/^[1-9][0-9]*$/.test(QA_APP_INSTALLATION_ID || '') ||
      !QA_APP_PRIVATE_KEY || !Number.isSafeInteger(repositoryId) || repositoryId < 1) {
    throw new Error('QA App credentials or repository ID are invalid')
  }
  const now = Math.floor(Date.now() / 1000)
  const encode = (data) => Buffer.from(JSON.stringify(data)).toString('base64url')
  const unsigned = `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode({ iat: now - 60, exp: now + 540, iss: QA_APP_ID })}`
  const jwt = `${unsigned}.${sign('RSA-SHA256', Buffer.from(unsigned), QA_APP_PRIVATE_KEY).toString('base64url')}`
  const issued = await send(`/app/installations/${QA_APP_INSTALLATION_ID}/access_tokens`, jwt, 'POST', {
    repository_ids: [repositoryId], permissions,
  })
  if (typeof issued?.token !== 'string' || !(Date.parse(issued.expires_at) > Date.now())) throw new Error('Invalid QA App token')
  return issued.token
}
