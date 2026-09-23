import { strict as assert } from 'node:assert'
import test from 'node:test'
import { waitForAcceptedBase } from '../scripts/wait-base.mjs'

const OLD = 'a'.repeat(40)
const BASE = 'b'.repeat(40)
const OTHER = 'c'.repeat(40)

test('waits for the exact source base promotion and revalidates the PR', async () => {
  const states = [OLD, OLD, BASE]
  let checks = 0
  let sleeps = 0
  const accepted = await waitForAcceptedBase(BASE, async () => ({
    sha: 'd'.repeat(40), sourceMainSha: states.shift(),
  }), async () => { checks++ }, async () => { sleeps++ }, 3)
  assert.equal(accepted, 'd'.repeat(40))
  assert.equal(checks, 1)
  assert.equal(sleeps, 2)
})

test('fails if another source commit is promoted or the wait expires', async () => {
  const states = [OLD, OTHER]
  await assert.rejects(waitForAcceptedBase(BASE,
    async () => ({ sha: 'd'.repeat(40), sourceMainSha: states.shift() }),
    async () => {}, async () => {}, 3), /different source commit/i)
  await assert.rejects(waitForAcceptedBase(BASE,
    async () => ({ sha: 'd'.repeat(40), sourceMainSha: OLD }),
    async () => {}, async () => {}, 2), /timed out/i)
})

test('does not accept a stale PR after the base catches up', async () => {
  await assert.rejects(waitForAcceptedBase(BASE,
    async () => ({ sha: 'd'.repeat(40), sourceMainSha: BASE }),
    async () => { throw new Error('Source PR base advanced') }, async () => {}, 2), /base advanced/i)
})
