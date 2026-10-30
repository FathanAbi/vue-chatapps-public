import type { Payload, TypedUser } from 'payload'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

import { toUsername } from './helpers'

let payload: Payload

type TestUser = {
  id: string
  email: string
  collection: string
}

const PASSWORD = 'Sup3rSecret!pass'

const unique = (label: string) =>
  `${label}-${Date.now()}-${Math.floor(Math.random() * 100000)}@example.com`

const created: Array<{ collection: 'penggunas' | 'users'; id: string }> = []

const createPengguna = async (label: string): Promise<TestUser> => {
  const username = toUsername(label)

  const user = await payload.create({
    collection: 'penggunas',
    data: {
      email: unique(label),
      password: PASSWORD,
      username,
    },
    draft: false,
    overrideAccess: true,
  }) as { id: number | string; email: string }

  created.push({ collection: 'penggunas', id: String(user.id) })

  return { id: String(user.id), email: user.email, collection: 'penggunas' }
}

const createAdmin = async (): Promise<TestUser> => {
  const user = await payload.create({
    collection: 'users',
    data: {
      email: unique('admin'),
      password: PASSWORD,
      // B3 / SEC-018: the role-aware `isAdmin` predicate requires this role.
      roles: ['admin'],
    },
    draft: false,
    overrideAccess: true,
  })

  created.push({ collection: 'users', id: String(user.id) })

  return { id: String(user.id), email: user.email, collection: 'users' }
}

/** Log a pengguna in through the local API to obtain a session-backed user. */
const loginPengguna = async (email: string): Promise<TypedUser> => {
  const { user } = await payload.login({
    collection: 'penggunas',
    data: { email, password: PASSWORD },
  })

  return user as TypedUser
}

/** Log an admin in through the local API to obtain a session-backed user. */
const loginAdmin = async (email: string): Promise<TypedUser> => {
  const { user } = await payload.login({
    collection: 'users',
    data: { email, password: PASSWORD },
  })

  return user as TypedUser
}

describe('SEC-001 — password takeover of arbitrary accounts', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    for (const entry of created) {
      await payload.delete({
        id: entry.id,
        collection: entry.collection,
        overrideAccess: true,
      })
    }
  })

  it('declares a `password` field with update access so the framework can enforce it', () => {
    const collection = payload.collections['penggunas']
    const passwordField = collection.config.flattenedFields.find(
      (field) => field.name === 'password',
    )

    expect(passwordField).toBeDefined()
    expect(passwordField?.access?.update).toBeTypeOf('function')
  })

  it('does not let user A overwrite user B’s password', async () => {
    const victim = await createPengguna('victim')
    const attacker = await createPengguna('attacker')

    const attackerSession = await loginPengguna(attacker.email)

    // The exact SEC-001 exploit: PATCH somebody else's account with a password.
    await expect(
      payload.update({
        id: victim.id,
        collection: 'penggunas',
        data: { password: 'AttackerControlled!1' },
        draft: false,
        overrideAccess: false,
        user: attackerSession,
      }),
    ).rejects.toThrow()
  }, 30000)

  it('keeps the original password working after a takeover attempt', async () => {
    const victim = await createPengguna('victim2')
    const attacker = await createPengguna('attacker2')

    const attackerSession = await loginPengguna(attacker.email)

    await payload
      .update({
        id: victim.id,
        collection: 'penggunas',
        data: { password: 'AttackerControlled!2' },
        draft: false,
        overrideAccess: false,
        user: attackerSession,
      })
      .catch(() => undefined)

    // The victim's original password must still work.
    const auth = await payload.login({
      collection: 'penggunas',
      data: { email: victim.email, password: PASSWORD },
    })

    expect(auth.user?.id).toBe(victim.id)

    // And the attacker's chosen password must not work.
    await expect(
      payload.login({
        collection: 'penggunas',
        data: { email: victim.email, password: 'AttackerControlled!2' },
      }),
    ).rejects.toThrow()
  }, 30000)

  it('lets a user change their own password', async () => {
    const owner = await createPengguna('owner')
    const session = await loginPengguna(owner.email)

    await payload.update({
      id: owner.id,
      collection: 'penggunas',
      data: { password: 'BrandNewP4ssword!' },
      draft: false,
      overrideAccess: false,
      user: session,
    })

    await expect(
      payload.login({
        collection: 'penggunas',
        data: { email: owner.email, password: 'BrandNewP4ssword!' },
      }),
    ).resolves.toBeDefined()
  }, 30000)

  it('does not let an application user overwrite an admin account’s password', async () => {
    const admin = await createAdmin()
    const attacker = await createPengguna('admin-attacker')
    const attackerSession = await loginPengguna(attacker.email)

    await expect(
      payload.update({
        id: admin.id,
        collection: 'users',
        data: { password: 'AttackerControlled!3' },
        draft: false,
        overrideAccess: false,
        user: attackerSession,
      }),
    ).rejects.toThrow()

    await expect(
      payload.login({
        collection: 'users',
        data: { email: admin.email, password: PASSWORD },
      }),
    ).resolves.toBeDefined()
  }, 30000)

  it('lets an admin overwrite an application account’s password', async () => {
    const victim = await createPengguna('victim3')
    const admin = await createAdmin()
    const adminSession = await loginAdmin(admin.email)

    await payload.update({
      id: victim.id,
      collection: 'penggunas',
      data: { password: 'AdminSetP4ssword!' },
      draft: false,
      overrideAccess: false,
      user: adminSession,
    })

    await expect(
      payload.login({
        collection: 'penggunas',
        data: { email: victim.email, password: 'AdminSetP4ssword!' },
      }),
    ).resolves.toBeDefined()
  }, 30000)
})
