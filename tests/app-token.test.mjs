import { strict as assert } from 'node:assert'
import { generateKeyPairSync } from 'node:crypto'
import test from 'node:test'
import { qaAppToken } from '../scripts/app-token.mjs'

test('limits the QA App installation token to the requested repository and permission', async () => {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const credentials = {
    QA_APP_ID: '5037798', QA_APP_INSTALLATION_ID: '163874619',
    QA_APP_PRIVATE_KEY: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  }
  let issued
  const send = async (path, _jwt, method, body) => {
    issued = { path, method, body }
    return { token: 'scoped-token', expires_at: new Date(Date.now() + 60000).toISOString() }
  }
  assert.equal(await qaAppToken(1382208661, { pull_requests: 'write' }, credentials, send), 'scoped-token')
  assert.equal(issued.path, '/app/installations/163874619/access_tokens')
  assert.equal(issued.method, 'POST')
  assert.deepEqual(issued.body, { repository_ids: [1382208661], permissions: { pull_requests: 'write' } })
})
