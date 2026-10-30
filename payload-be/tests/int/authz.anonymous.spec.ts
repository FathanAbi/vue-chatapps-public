import type { Payload } from 'payload'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

import { createPengguna, loginPengguna, TestRegistry } from './helpers'

let payload: Payload
const registry = new TestRegistry()

describe('SEC-002 / SEC-003 — anonymous access is denied everywhere', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await registry.cleanup(payload)
  })

  const collections = [
    'penggunas',
    'chats',
    'channels',
    'memberships',
    'messages',
    'media',
    'users',
  ] as const

  it.each(collections)('denies anonymous reads of %s', async (collection) => {
    await expect(payload.find({ collection, overrideAccess: false })).rejects.toThrow()
  })

  it('denies anonymous chat creation', async () => {
    const recipient = await createPengguna(payload, registry, 'anon-chat-recipient')

    await expect(
      payload.create({
        collection: 'chats',
        data: { message: 'hello', receiver_id: recipient.id, sender_id: recipient.id },
        draft: false,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('denies anonymous channel creation', async () => {
    await expect(
      payload.create({
        collection: 'channels',
        data: { channel_name: 'anonymous-channel', owner: '1' },
        draft: false,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('denies anonymous membership creation', async () => {
    await expect(
      payload.create({
        collection: 'memberships',
        data: { channel_id: '1', pengguna_id: '1' },
        draft: false,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('denies anonymous message creation', async () => {
    await expect(
      payload.create({
        collection: 'messages',
        data: { message: 'hello', Channel: '1', Sender: '1' },
        draft: false,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })
})

describe('SEC-005 — the sender is bound to the session', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await registry.cleanup(payload)
  })

  it('ignores a spoofed `sender_id` on `chats`', async () => {
    const victim = await createPengguna(payload, registry, 'spoof-target')
    const attacker = await createPengguna(payload, registry, 'spoof-attacker')
    const session = await loginPengguna(payload, attacker.email)

    const chat = await payload.create({
      collection: 'chats',
      data: {
        message: 'spoofed message',
        receiver_id: victim.id,
        sender_id: victim.id,
      },
      draft: false,
      overrideAccess: false,
      user: session,
    })

    const senderId = typeof chat.sender_id === 'object' ? chat.sender_id.id : chat.sender_id

    expect(String(senderId)).toBe(attacker.id)
  })

  it('ignores a spoofed `Sender` on `messages`', async () => {
    const victim = await createPengguna(payload, registry, 'spoof-target-2')
    const attacker = await createPengguna(payload, registry, 'spoof-attacker-2')
    const session = await loginPengguna(payload, attacker.email)

    const channel = await payload.create({
      collection: 'channels',
      data: { channel_name: 'spoof-channel', owner: attacker.id },
      draft: false,
      overrideAccess: false,
      user: session,
    })

    // SEC-003 / T-AUTHZ-09: posting requires channel membership.
    await payload.create({
      collection: 'memberships',
      data: { channel_id: channel.id, pengguna_id: attacker.id },
      draft: false,
      overrideAccess: false,
      user: session,
    })

    const message = await payload.create({
      collection: 'messages',
      data: {
        Channel: channel.id,
        Sender: victim.id,
        message: 'spoofed channel message',
      },
      draft: false,
      overrideAccess: false,
      user: session,
    })

    const senderId = typeof message.Sender === 'object' ? message.Sender.id : message.Sender

    expect(String(senderId)).toBe(attacker.id)
  })

  it('does not let a user force another account into a channel', async () => {
    const victim = await createPengguna(payload, registry, 'forced-target')
    const attacker = await createPengguna(payload, registry, 'forced-attacker')
    const session = await loginPengguna(payload, attacker.email)

    const channel = await payload.create({
      collection: 'channels',
      data: { channel_name: 'forced-join-channel', owner: attacker.id },
      draft: false,
      overrideAccess: false,
      user: session,
    })

    const membership = await payload.create({
      collection: 'memberships',
      data: {
        channel_id: channel.id,
        pengguna_id: victim.id,
      },
      draft: false,
      overrideAccess: false,
      user: session,
    })

    const penggunaId =
      typeof membership.pengguna_id === 'object'
        ? membership.pengguna_id.id
        : membership.pengguna_id

    expect(String(penggunaId)).toBe(attacker.id)
  })

  it('does not let a user transfer channel ownership', async () => {
    const victim = await createPengguna(payload, registry, 'owner-target')
    const attacker = await createPengguna(payload, registry, 'owner-attacker')
    const session = await loginPengguna(payload, attacker.email)

    const channel = await payload.create({
      collection: 'channels',
      data: { channel_name: 'ownership-channel', owner: attacker.id },
      draft: false,
      overrideAccess: false,
      user: session,
    })

    const updated = await payload.update({
      id: channel.id,
      collection: 'channels',
      data: { owner: victim.id },
      draft: false,
      overrideAccess: false,
      user: session,
    })

    // The write is dropped by the field-level access rule on `owner`, so the
    // channel keeps its original owner.
    const ownerId = typeof updated.owner === 'object' ? updated.owner.id : updated.owner

    expect(String(ownerId)).toBe(attacker.id)
  })

  it('does not let a non-owner rename or delete a channel', async () => {
    const owner = await createPengguna(payload, registry, 'rename-owner')
    const intruder = await createPengguna(payload, registry, 'rename-intruder')

    const ownerSession = await loginPengguna(payload, owner.email)
    const intruderSession = await loginPengguna(payload, intruder.email)

    const channel = await payload.create({
      collection: 'channels',
      data: { channel_name: 'owned-channel', owner: owner.id },
      draft: false,
      overrideAccess: false,
      user: ownerSession,
    })

    await expect(
      payload.update({
        id: channel.id,
        collection: 'channels',
        data: { channel_name: 'hijacked-name' },
        draft: false,
        overrideAccess: false,
        user: intruderSession,
      }),
    ).rejects.toThrow()

    await expect(
      payload.delete({
        id: channel.id,
        collection: 'channels',
        overrideAccess: false,
        user: intruderSession,
      }),
    ).rejects.toThrow()
  })

  it('hides another user’s email address when a relationship is populated', async () => {
    const owner = await createPengguna(payload, registry, 'populated-owner')
    const reader = await createPengguna(payload, registry, 'populated-reader')

    const ownerSession = await loginPengguna(payload, owner.email)
    const readerSession = await loginPengguna(payload, reader.email)

    const channel = await payload.create({
      collection: 'channels',
      data: { channel_name: 'populated-channel', owner: owner.id },
      draft: false,
      overrideAccess: false,
      user: ownerSession,
    })

    const found = await payload.findByID({
      id: channel.id,
      collection: 'channels',
      depth: 1,
      overrideAccess: false,
      user: readerSession,
    })

    const populatedOwner = found.owner as { email?: string; username?: string }

    expect(populatedOwner.username).toBe(owner.username)
    expect(populatedOwner.email).toBeUndefined()
  })
})

describe('SEC-005 — conversations are private to their participants', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await registry.cleanup(payload)
  })

  it('does not let a third party read a conversation', async () => {
    const alice = await createPengguna(payload, registry, 'chat-alice')
    const bob = await createPengguna(payload, registry, 'chat-bob')
    const eve = await createPengguna(payload, registry, 'chat-eve')

    const aliceSession = await loginPengguna(payload, alice.email)
    const eveSession = await loginPengguna(payload, eve.email)

    await payload.create({
      collection: 'chats',
      data: { message: 'private', receiver_id: bob.id, sender_id: alice.id },
      draft: false,
      overrideAccess: false,
      user: aliceSession,
    })

    const found = await payload.find({
      collection: 'chats',
      overrideAccess: false,
      user: eveSession,
    })

    expect(found.docs).toHaveLength(0)
  })

  it('lets a participant read the conversation', async () => {
    const alice = await createPengguna(payload, registry, 'chat-alice-2')
    const bob = await createPengguna(payload, registry, 'chat-bob-2')

    const aliceSession = await loginPengguna(payload, alice.email)
    const bobSession = await loginPengguna(payload, bob.email)

    await payload.create({
      collection: 'chats',
      data: { message: 'shared', receiver_id: bob.id, sender_id: alice.id },
      draft: false,
      overrideAccess: false,
      user: aliceSession,
    })

    const found = await payload.find({
      collection: 'chats',
      overrideAccess: false,
      user: bobSession,
    })

    expect(found.docs.length).toBeGreaterThan(0)
  })
})

describe('SEC-003 / T-AUTHZ-08,09 — channel messages are scoped to membership', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await registry.cleanup(payload)
  })

  it('does not let a non-member read a channel’s messages', async () => {
    const owner = await createPengguna(payload, registry, 'mem-owner')
    const outsider = await createPengguna(payload, registry, 'mem-outsider')

    const ownerSession = await loginPengguna(payload, owner.email)
    const outsiderSession = await loginPengguna(payload, outsider.email)

    const channel = await payload.create({
      collection: 'channels',
      data: { channel_name: 'private-chan', owner: owner.id },
      draft: false,
      overrideAccess: false,
      user: ownerSession,
    })

    await payload.create({
      collection: 'memberships',
      data: { channel_id: channel.id, pengguna_id: owner.id },
      draft: false,
      overrideAccess: false,
      user: ownerSession,
    })

    await payload.create({
      collection: 'messages',
      data: { Channel: channel.id, message: 'secret', Sender: owner.id },
      draft: false,
      overrideAccess: false,
      user: ownerSession,
    })

    const found = await payload.find({
      collection: 'messages',
      overrideAccess: false,
      user: outsiderSession,
    })

    expect(found.docs).toHaveLength(0)
  })

  it('does not let a non-member post into a channel', async () => {
    const owner = await createPengguna(payload, registry, 'post-owner')
    const outsider = await createPengguna(payload, registry, 'post-outsider')

    const ownerSession = await loginPengguna(payload, owner.email)
    const outsiderSession = await loginPengguna(payload, outsider.email)

    const channel = await payload.create({
      collection: 'channels',
      data: { channel_name: 'join-required-chan', owner: owner.id },
      draft: false,
      overrideAccess: false,
      user: ownerSession,
    })

    await expect(
      payload.create({
        collection: 'messages',
        data: { Channel: channel.id, message: 'intrusion', Sender: outsider.id },
        draft: false,
        overrideAccess: false,
        user: outsiderSession,
      }),
    ).rejects.toThrow()
  })

  it('lets a member read and post in the channel', async () => {
    const owner = await createPengguna(payload, registry, 'member-owner')
    const member = await createPengguna(payload, registry, 'member-member')

    const ownerSession = await loginPengguna(payload, owner.email)
    const memberSession = await loginPengguna(payload, member.email)

    const channel = await payload.create({
      collection: 'channels',
      data: { channel_name: 'member-chan', owner: owner.id },
      draft: false,
      overrideAccess: false,
      user: ownerSession,
    })

    await payload.create({
      collection: 'memberships',
      data: { channel_id: channel.id, pengguna_id: member.id },
      draft: false,
      overrideAccess: false,
      user: memberSession,
    })

    await payload.create({
      collection: 'messages',
      data: { Channel: channel.id, message: 'hello', Sender: member.id },
      draft: false,
      overrideAccess: false,
      user: memberSession,
    })

    const found = await payload.find({
      collection: 'messages',
      overrideAccess: false,
      user: memberSession,
    })

    expect(found.docs.length).toBeGreaterThan(0)
  })
})
