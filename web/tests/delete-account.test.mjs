import assert from 'node:assert/strict'
import { test } from 'node:test'
import { AccountDeletionError, deleteAccount } from '../src/lib/delete-account.ts'

test('a data failure leaves the sign-in account untouched', async () => {
  let clerkCalled = false
  await assert.rejects(deleteAccount(
    async () => { throw new Error('Database unavailable') },
    async () => { clerkCalled = true },
  ), error => error instanceof AccountDeletionError && error.stage === 'data'
    && error.message.includes('Database unavailable'))
  assert.equal(clerkCalled, false)
})

test('Clerk refusal remains a visible partial deletion that can be retried', async () => {
  const calls = []
  const data = async () => { calls.push('data') }
  await assert.rejects(deleteAccount(data, async () => {
    calls.push('clerk failed')
    throw new Error('Verification cancelled')
  }), error => error instanceof AccountDeletionError && error.stage === 'sign-in'
    && error.message.includes('sign-in account is still active'))
  await deleteAccount(data, async () => { calls.push('clerk deleted') })
  assert.deepEqual(calls, ['data', 'clerk failed', 'data', 'clerk deleted'])
})

test('deletion completes only after both services succeed', async () => {
  const calls = []
  await deleteAccount(async () => { calls.push('data') }, async () => { calls.push('clerk') })
  assert.deepEqual(calls, ['data', 'clerk'])
})
