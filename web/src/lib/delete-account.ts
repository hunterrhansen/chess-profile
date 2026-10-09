/** Keep partial deletion visible so a failed Clerk request can be retried. */
export class AccountDeletionError extends Error {
  readonly stage: 'data' | 'sign-in'

  constructor(stage: 'data' | 'sign-in', cause: unknown) {
    const detail = cause instanceof Error ? cause.message : 'Please try again.'
    super(stage === 'data'
      ? `Couldn't delete your data: ${detail}`
      : `Your Knightly data was deleted, but your sign-in account is still active. Try again to finish deleting your account. ${detail}`,
    { cause })
    this.stage = stage
  }
}

export async function deleteAccount(deleteData: () => Promise<unknown>, deleteSignIn: () => Promise<unknown>) {
  try {
    await deleteData()
  } catch (error) {
    throw new AccountDeletionError('data', error)
  }
  try {
    await deleteSignIn()
  } catch (error) {
    throw new AccountDeletionError('sign-in', error)
  }
}
