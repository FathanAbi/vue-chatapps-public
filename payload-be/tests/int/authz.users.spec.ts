import type { Payload } from 'payload'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

import {
  createAdmin,
  createPengguna,
  loginAdmin,
  loginPengguna,
  TestRegistry,
} from './helpers'

let payload: Payload
const registry = new TestRegistry()

describe('SEC-001 — the `users` admin collection', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await registry.cleanup(payload)
  })

  it('denies anonymous reads of the admin collection', async () => {
    await expect(
      payload.find({ collection: 'users', overrideAccess: false }),
    ).rejects.toThrow()
  })

  it('denies an application user read access to the admin collection', async () => {
    const pengguna = await createPengguna(payload, registry, 'app-user')
    const session = await loginPengguna(payload, pengguna.email)

    await expect(
      payload.find({ collection: 'users', overrideAccess: false, user: session }),
    ).rejects.toThrow()
  })

  it('denies an application user update access to the admin collection', async () => {
    const admin = await createAdmin(payload, registry)
    const pengguna = await createPengguna(payload, registry, 'app-user-2')
    const session = await loginPengguna(payload, pengguna.email)

    await expect(
      payload.update({
        id: admin.id,
        collection: 'users',
        data: { email: 'attacker-owned@example.com' },
        draft: false,
        overrideAccess: false,
        user: session,
      }),
    ).rejects.toThrow()
  })

  it('denies an application user delete access to the admin collection', async () => {
    const admin = await createAdmin(payload, registry)
    const pengguna = await createPengguna(payload, registry, 'app-user-3')
    const session = await loginPengguna(payload, pengguna.email)

    await expect(
      payload.delete({
        id: admin.id,
        collection: 'users',
        overrideAccess: false,
        user: session,
      }),
    ).rejects.toThrow()
  })

  it('denies an application user create access to the admin collection', async () => {
    const pengguna = await createPengguna(payload, registry, 'app-user-4')
    const session = await loginPengguna(payload, pengguna.email)

    await expect(
      payload.create({
        collection: 'users',
        data: { email: 'sneaky-admin@example.com', password: 'Sup3rSecret!pass' },
        draft: false,
        overrideAccess: false,
        user: session,
      }),
    ).rejects.toThrow()
  })

  it('allows an admin to read the admin collection', async () => {
    const admin = await createAdmin(payload, registry)
    const session = await loginAdmin(payload, admin.email)

    const result = await payload.find({
      collection: 'users',
      overrideAccess: false,
      user: session,
    })

    expect(result.docs.length).toBeGreaterThan(0)
  })

  it('denies a `users` account without the admin role (T-AUTHZ-15, B3)', async () => {
    // An operator who can reach the Admin Panel but has not been granted the
    // `admin` role must not be treated as an administrator.
    const operator = await payload.create({
      collection: 'users',
      data: {
        email: `operator-${Date.now()}@example.com`,
        password: 'Sup3rSecret!pass',
        roles: ['user'],
      },
      overrideAccess: true,
    })

    registry.track('users', operator.id)

    const session = await loginAdmin(payload, operator.email)

    await expect(
      payload.find({ collection: 'users', overrideAccess: false, user: session }),
    ).rejects.toThrow()
  })
})
