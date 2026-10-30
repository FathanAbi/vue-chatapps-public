import type { Payload } from 'payload'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'

import {
  buildDirectory,
  DEFAULT_DIRECTORY_LIMIT,
  directoryHandler,
  MAX_DIRECTORY_LIMIT,
  MIN_QUERY_LENGTH,
  parseDirectoryQuery,
} from '@/endpoints/directory'

import { createPengguna, loginPengguna, TestRegistry } from './helpers'

let payload: Payload
const registry = new TestRegistry()

describe('the sanitized users directory', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await registry.cleanup(payload)
  })

  it('contains no email addresses', () => {
    const result = buildDirectory([
      { id: '1', username: 'alice' },
      { id: '2', username: null },
    ])

    expect(result).toEqual([
      { id: '1', username: 'alice' },
      { id: '2', username: null },
    ])

    for (const entry of result) {
      expect(entry).not.toHaveProperty('email')
    }
  })

  it('rejects an anonymous request', async () => {
    const response = await directoryHandler({
      payload,
      user: undefined,
      url: `http://localhost/api/penggunas/directory?q=ali`,
    } as never)

    expect(response.status).toBe(403)
  })

  it('requires a search term of at least two characters (SEC-013)', async () => {
    const viewer = await createPengguna(payload, registry, 'directory-noq')
    const session = await loginPengguna(payload, viewer.email)

    for (const url of [
      'http://localhost/api/penggunas/directory',
      'http://localhost/api/penggunas/directory?q=',
      'http://localhost/api/penggunas/directory?q=a',
    ]) {
      const response = await directoryHandler({
        payload,
        user: session,
        url,
      } as never)

      expect(response.status).toBe(400)
    }
  })

  it('returns usernames but no emails for an authenticated request', async () => {
    const viewer = await createPengguna(payload, registry, 'directory-viewer')
    const other = await createPengguna(payload, registry, 'directory-other')

    const session = await loginPengguna(payload, viewer.email)

    const response = await directoryHandler({
      payload,
      user: session,
      url: `http://localhost/api/penggunas/directory?q=${encodeURIComponent(other.username as string)}`,
    } as never)

    expect(response.status).toBe(200)

    const body = await response.json()

    expect(Array.isArray(body.docs)).toBe(true)

    for (const doc of body.docs) {
      expect(doc).not.toHaveProperty('email')
      expect(Object.keys(doc).sort()).toEqual(['id', 'username'])
    }

    const otherEntry = body.docs.find(
      (doc: { id: string }) => String(doc.id) === other.id,
    )

    expect(otherEntry).toBeDefined()
    expect(otherEntry.username).toBe(other.username)
  })

  it('filters by the search term and excludes non-matches', async () => {
    const viewer = await createPengguna(payload, registry, 'directory-searcher')
    // The random suffix makes the term unique across the shared test database.
    const term = `zq${Date.now().toString(36).slice(-6)}`
    const match = await createPengguna(payload, registry, `${term}_findme`)
    await createPengguna(payload, registry, 'someone_else_entirely')

    const session = await loginPengguna(payload, viewer.email)

    const response = await directoryHandler({
      payload,
      user: session,
      url: `http://localhost/api/penggunas/directory?q=${encodeURIComponent(term)}`,
    } as never)

    expect(response.status).toBe(200)

    const body = await response.json()
    const ids = body.docs.map((doc: { id: string }) => String(doc.id))

    expect(ids).toContain(match.id)
    expect(body.docs.every((doc: { username: string }) => doc.username.includes(term))).toBe(true)
  })
})

describe('parseDirectoryQuery', () => {
  it('returns null when the term is missing or too short', () => {
    expect(parseDirectoryQuery('/api/penggunas/directory')).toBeNull()
    expect(parseDirectoryQuery('/api/penggunas/directory?q=a')).toBeNull()
    expect(parseDirectoryQuery(`/api/penggunas/directory?q=${'a'.repeat(MIN_QUERY_LENGTH - 1)}`)).toBeNull()
  })

  it('accepts a term of exactly the minimum length', () => {
    expect(parseDirectoryQuery(`/api/penggunas/directory?q=${'a'.repeat(MIN_QUERY_LENGTH)}`)).toEqual({
      q: 'a'.repeat(MIN_QUERY_LENGTH),
      page: 1,
      limit: DEFAULT_DIRECTORY_LIMIT,
    })
  })

  it('defaults page and limit and clamps the limit to the maximum', () => {
    expect(parseDirectoryQuery('/api/penggunas/directory?q=alice')).toEqual({
      q: 'alice',
      page: 1,
      limit: DEFAULT_DIRECTORY_LIMIT,
    })

    expect(parseDirectoryQuery('/api/penggunas/directory?q=alice&limit=100000')?.limit).toBe(
      MAX_DIRECTORY_LIMIT,
    )

    expect(parseDirectoryQuery('/api/penggunas/directory?q=alice&page=3&limit=10')).toEqual({
      q: 'alice',
      page: 3,
      limit: 10,
    })
  })

  it('falls back to safe defaults for invalid page/limit values', () => {
    expect(parseDirectoryQuery('/api/penggunas/directory?q=alice&page=0&limit=-5')).toEqual({
      q: 'alice',
      page: 1,
      limit: DEFAULT_DIRECTORY_LIMIT,
    })
  })
})
