import type { Payload } from 'payload'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

import { createPengguna, loginPengguna, TestRegistry } from './helpers'

let payload: Payload
const registry = new TestRegistry()

describe('SEC-001 — the `penggunas` collection', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await registry.cleanup(payload)
  })

  it('denies anonymous reads', async () => {
    await expect(payload.find({ collection: 'penggunas', overrideAccess: false })).rejects.toThrow()
  })

  it('denies anonymous updates', async () => {
    const victim = await createPengguna(payload, registry, 'anon-target')

    await expect(
      payload.update({
        id: victim.id,
        collection: 'penggunas',
        data: { username: 'hijacked' },
        draft: false,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('denies anonymous deletes', async () => {
    const victim = await createPengguna(payload, registry, 'anon-target-2')

    await expect(
      payload.delete({
        id: victim.id,
        collection: 'penggunas',
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('lets a user update their own document', async () => {
    const owner = await createPengguna(payload, registry, 'self-owner')
    const session = await loginPengguna(payload, owner.email)

    const updated = await payload.update({
      id: owner.id,
      collection: 'penggunas',
      data: { username: 'renamed_by_owner' },
      draft: false,
      overrideAccess: false,
      user: session,
    })

    expect(updated.username).toBe('renamed_by_owner')
  })

  it('denies a user updating another user’s document', async () => {
    const victim = await createPengguna(payload, registry, 'other-target')
    const attacker = await createPengguna(payload, registry, 'other-attacker')
    const session = await loginPengguna(payload, attacker.email)

    await expect(
      payload.update({
        id: victim.id,
        collection: 'penggunas',
        data: { username: 'hijacked' },
        draft: false,
        overrideAccess: false,
        user: session,
      }),
    ).rejects.toThrow()
  })

  it('denies a user deleting another user’s document', async () => {
    const victim = await createPengguna(payload, registry, 'other-target-2')
    const attacker = await createPengguna(payload, registry, 'other-attacker-2')
    const session = await loginPengguna(payload, attacker.email)

    await expect(
      payload.delete({
        id: victim.id,
        collection: 'penggunas',
        overrideAccess: false,
        user: session,
      }),
    ).rejects.toThrow()
  })

  it('hides another user’s email address from an authenticated reader', async () => {
    const victim = await createPengguna(payload, registry, 'email-victim')
    const reader = await createPengguna(payload, registry, 'email-reader')
    const session = await loginPengguna(payload, reader.email)

    const found = await payload.findByID({
      id: victim.id,
      collection: 'penggunas',
      overrideAccess: false,
      user: session,
    })

    expect(found.username).toBe(victim.username)
    expect(found.email).toBeUndefined()
  })

  it('shows a user their own email address', async () => {
    const owner = await createPengguna(payload, registry, 'email-owner')
    const session = await loginPengguna(payload, owner.email)

    const found = await payload.findByID({
      id: owner.id,
      collection: 'penggunas',
      overrideAccess: false,
      user: session,
    })

    expect(found.email).toBe(owner.email)
  })

  it('still exposes the caller’s own email through the `me` endpoint', async () => {
    const owner = await createPengguna(payload, registry, 'me-owner')
    const session = await loginPengguna(payload, owner.email)

    // `GET /api/penggunas/me` must keep working: the SPA reads `user.username`
    // and `user.email` from it.
    const found = await payload.findByID({
      id: session.id,
      collection: 'penggunas',
      overrideAccess: false,
      user: session,
    })

    expect(found.email).toBe(owner.email)
    expect(found.username).toBe(owner.username)
  })

  it('does not expose other users’ email addresses in a list read (SEC-013)', async () => {
    const reader = await createPengguna(payload, registry, 'list-email-reader')
    await createPengguna(payload, registry, 'list-email-other')

    const session = await loginPengguna(payload, reader.email)

    const found = await payload.find({
      collection: 'penggunas',
      limit: 100,
      overrideAccess: false,
      pagination: false,
      user: session,
    })

    expect(found.docs.length).toBeGreaterThan(0)

    for (const doc of found.docs) {
      if (String(doc.id) === String(reader.id)) {
        expect(doc.email).toBe(reader.email)
      } else {
        expect(doc.email).toBeUndefined()
      }
    }
  })

  it('does not expose a caller’s email when reading a different document', async () => {
    const owner = await createPengguna(payload, registry, 'email-owner-2')
    const other = await createPengguna(payload, registry, 'email-other-2')
    const session = await loginPengguna(payload, owner.email)

    const found = await payload.findByID({
      id: other.id,
      collection: 'penggunas',
      overrideAccess: false,
      user: session,
    })

    expect(found.email).toBeUndefined()
  })
})
