import type { Payload, TypedUser } from 'payload'

/**
 * Shared helpers for the access-control regression suites.
 *
 * The tests exercise the real Payload instance against the configured MongoDB
 * database, so they need `DATABASE_URI` and `PAYLOAD_SECRET` in the environment.
 */

export const TEST_PASSWORD = 'Sup3rSecret!pass'

export type TestAccount = {
  id: string
  email: string
  username?: string
  collection: 'penggunas' | 'users'
}

export const uniqueEmail = (label: string): string =>
  `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`

/**
 * Turn a free-form test label into a username that satisfies the SEC-010
 * pattern `/^[a-z0-9_]{3,24}$/` (lowercase, digits, underscores, 3-24 chars).
 */
export const toUsername = (label: string): string => {
  const normalised = label.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  const suffix = Math.floor(Math.random() * 100000)
  const trimmed = `${normalised}_${suffix}`.slice(0, 24)

  // Guarantee the minimum length even after truncation.
  return trimmed.length >= 3 ? trimmed : trimmed.padEnd(3, '0')
}

/**
 * A registry of documents created by a test run, so that they can be removed
 * afterwards even when the test itself fails.
 */
export class TestRegistry {
  private entries: Array<{ collection: 'penggunas' | 'users'; id: string }> = []

  track(collection: 'penggunas' | 'users', id: string | number): void {
    this.entries.push({ collection, id: String(id) })
  }

  async cleanup(payload: Payload): Promise<void> {
    for (const entry of this.entries) {
      await payload
        .delete({
          id: entry.id,
          collection: entry.collection,
          overrideAccess: true,
        })
        .catch(() => undefined)
    }

    this.entries = []
  }
}

export const createPengguna = async (
  payload: Payload,
  registry: TestRegistry,
  username: string,
): Promise<TestAccount> => {
  const finalUsername = toUsername(username)

  const user = await payload.create({
    collection: 'penggunas',
    data: {
      email: uniqueEmail(username),
      password: TEST_PASSWORD,
      username: finalUsername,
    },
    overrideAccess: true,
  }) as { id: number | string; email: string }

  registry.track('penggunas', user.id)

  return {
    id: String(user.id),
    email: user.email,
    username: finalUsername,
    collection: 'penggunas',
  }
}

export const createAdmin = async (
  payload: Payload,
  registry: TestRegistry,
): Promise<TestAccount> => {
  const user = await payload.create({
    collection: 'users',
    data: {
      email: uniqueEmail('admin'),
      password: TEST_PASSWORD,
      // B3 / SEC-018: an administrator must carry the `admin` role for the
      // role-aware `isAdmin` predicate to recognise the session.
      roles: ['admin'],
    },
    overrideAccess: true,
  })

  registry.track('users', user.id)

  return { id: String(user.id), email: user.email, collection: 'users' }
}

export const loginPengguna = async (
  payload: Payload,
  email: string,
): Promise<TypedUser> => {
  const { user } = await payload.login({
    collection: 'penggunas',
    data: { email, password: TEST_PASSWORD },
  })

  return user as TypedUser
}

export const loginAdmin = async (payload: Payload, email: string): Promise<TypedUser> => {
  const { user } = await payload.login({
    collection: 'users',
    data: { email, password: TEST_PASSWORD },
  })

  return user as TypedUser
}
