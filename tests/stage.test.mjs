import { strict as assert } from 'node:assert'
import test from 'node:test'
import { closeObsoleteProposal, ensureProposal } from '../scripts/stage.mjs'

test('closes a stale QA proposal when candidate restores the accepted tests', async () => {
  const calls = []
  const request = async (path, method, body) => {
    calls.push({ path, method, body })
    if (method === 'GET') return [{ number: 7, state: 'open', head: { ref: 'proposals/source-pr-54', repo: { full_name: 'IgnisDevNE/CircuitoNE-QA' } } }]
    return { state: 'closed' }
  }
  await closeObsoleteProposal(54, request)
  assert.equal(calls.length, 2)
  assert.deepEqual(calls[1], { path: '/repos/IgnisDevNE/CircuitoNE-QA/pulls/7', method: 'PATCH', body: { state: 'closed' } })
})

test('opens a QA proposal as the independent App for the exact source SHA', async () => {
  const calls = []
  const send = async (path, method, body) => {
    calls.push({ path, method, body })
    return method === 'GET' ? [] : { html_url: 'https://github.com/IgnisDevNE/CircuitoNE-QA/pull/1' }
  }
  const url = await ensureProposal(54, 'a'.repeat(40), 'b'.repeat(40), send)
  assert.equal(url, 'https://github.com/IgnisDevNE/CircuitoNE-QA/pull/1')
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[1].path, '/repos/IgnisDevNE/CircuitoNE-QA/pulls')
  assert.equal(calls[1].method, 'POST')
  assert.equal(calls[1].body.head, 'proposals/source-pr-54')
  assert.equal(calls[1].body.base, 'accepted')
  assert.match(calls[1].body.body, /a{40}/)
  assert.match(calls[1].body.body, /b{40}/)
})

test('reuses an existing QA proposal for the same source PR', async () => {
  const send = async (_path, method) => {
    assert.equal(method, 'GET')
    return [{ state: 'open', user: { login: 'circuitone-qa-publisher[bot]' }, head: { ref: 'proposals/source-pr-54', repo: { full_name: 'IgnisDevNE/CircuitoNE-QA' } }, base: { ref: 'accepted' }, html_url: 'https://github.com/IgnisDevNE/CircuitoNE-QA/pull/1' }]
  }
  assert.equal(await ensureProposal(54, 'a'.repeat(40), 'b'.repeat(40), send), 'https://github.com/IgnisDevNE/CircuitoNE-QA/pull/1')
})

test('does not reuse a human-authored proposal that its author cannot approve', async () => {
  const send = async () => [{ state: 'open', user: { login: 'magalz' }, head: { ref: 'proposals/source-pr-54', repo: { full_name: 'IgnisDevNE/CircuitoNE-QA' } }, base: { ref: 'accepted' } }]
  await assert.rejects(ensureProposal(54, 'a'.repeat(40), 'b'.repeat(40), send), /must be opened by the QA App/)
})
