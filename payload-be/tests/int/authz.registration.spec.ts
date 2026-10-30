import type { Payload } from 'payload'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

import { TEST_PASSWORD, TestRegistry, createPengguna, uniqueEmail } from './helpers'

let payload: Payload
const registry = new TestRegistry()

/**
 * SEC-010 — account creation and password policy.
 *
 * These tests exercise the collection configuration through the local API with
 * `overrideAccess: true`, which bypasses the access functions but still runs the
 * `beforeValidate` / field-validation hooks the policy is implemented in.
 */
describe('SEC-010 — password and username policy', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await registry.cleanup(payload)
  })

  it('rejects a password shorter than 8 characters', async () => {
    await expect(
      payload.create({
        collection: 'penggunas',
        data: {
          email: uniqueEmail('short-pw'),
          password: 'short',
          username: 'short_pw_user',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('accepts a password of 8 characters or more', async () => {
    const user = await payload.create({
      collection: 'penggunas',
      data: {
        email: uniqueEmail('ok-pw'),
        password: '12345678',
        username: 'ok_pw_user',
      },
      overrideAccess: true,
    })

    registry.track('penggunas', user.id)

    expect(user.id).toBeDefined()
  })

  it('rejects a username with invalid characters', async () => {
    await expect(
      payload.create({
        collection: 'penggunas',
        data: {
          email: uniqueEmail('bad-name'),
          password: '12345678',
          username: 'has-a-hyphen',
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects a duplicate username', async () => {
    const first = await createPengguna(payload, registry, 'duplicate')
    const username = first.username as string

    await expect(
      payload.create({
        collection: 'penggunas',
        data: {
          email: uniqueEmail('duplicate-2'),
          password: '12345678',
          username,
        },
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('lets a freshly registered account log in without email verification (B1)', async () => {
    const user = await payload.create({
      collection: 'penggunas',
      data: {
        email: uniqueEmail('no-verify'),
        password: '12345678',
        username: 'no_verify_user',
      },
      overrideAccess: true,
    })

    registry.track('penggunas', user.id)

    // Verification is intentionally disabled: registration must be immediately
    // usable, so a brand-new account can log in straight away.
    const { user: session } = await payload.login({
      collection: 'penggunas',
      data: { email: user.email as string, password: '12345678' },
    })

    expect(session).toBeDefined()
  })

  it('completes a password reset round-trip (B1)', async () => {
    const user = await createPengguna(payload, registry, 'reset-flow')

    const token = await payload.forgotPassword({
      collection: 'penggunas',
      data: { email: user.email as string },
      disableEmail: true,
    })

    expect(typeof token).toBe('string')
    expect(token).toBeTruthy()

    await payload.resetPassword({
      collection: 'penggunas',
      data: { password: 'BrandNew!pass', token: token as string },
      overrideAccess: true,
    })

    // The new password works…
    const { user: session } = await payload.login({
      collection: 'penggunas',
      data: { email: user.email as string, password: 'BrandNew!pass' },
    })
    expect(session).toBeDefined()

    // …and the original password no longer does.
    await expect(
      payload.login({
        collection: 'penggunas',
        data: { email: user.email as string, password: TEST_PASSWORD },
      }),
    ).rejects.toThrow()
  })
})
