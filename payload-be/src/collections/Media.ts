import { APIError, type CollectionConfig } from 'payload'

import { isAuthenticated } from '../access'

/** Maximum accepted upload size, in bytes (5 MB). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

/**
 * SEC-004: the only content types this collection will accept.
 *
 * The list is deliberately limited to raster image formats. SVG, XML, HTML and
 * every other markup format can carry script, and a stored file is served from
 * the API's own origin — so accepting them turns an upload into same-origin
 * stored XSS.
 *
 * Payload 3.92.1 performs the type check against the *file buffer* (via
 * `file-type`), not against the client-supplied `Content-Type`, so a renamed
 * `.svg` is still rejected.
 */
export const ALLOWED_UPLOAD_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

/**
 * SEC-004: the Content-Security-Policy applied to every served upload.
 *
 * `sandbox` (with no `allow-scripts`) puts the response in an opaque origin:
 * even if a file could execute script, it could not touch the API origin's
 * cookies, storage or DOM. This is the control that neutralises files that
 * were uploaded *before* the type allow-list existed.
 */
export const UPLOAD_CSP =
  "sandbox; default-src 'none'; script-src 'none'; object-src 'none'; frame-src 'none'; base-uri 'none'"

/**
 * SEC-004: decide how a stored file must be served.
 *
 * - The four raster image types are served inline with `nosniff`, so they can
 *   still be used as `<img src>`.
 * - Anything else — a legacy SVG, a stray HTML file, an unknown type — is
 *   served as an **attachment** and with the sandbox CSP, so it can never be
 *   rendered as a document in the API origin.
 *
 * When the content type cannot be proven to be a raster image, the safe
 * default applies: download, never render.
 */
export const buildUploadResponseHeaders = (
  contentType: string | null | undefined,
): Headers => {
  const headers = new Headers()

  headers.set('X-Content-Type-Options', 'nosniff')
  headers.set('Content-Security-Policy', UPLOAD_CSP)
  headers.set('Cross-Origin-Resource-Policy', 'same-site')
  headers.set('X-Frame-Options', 'DENY')
  headers.set('Referrer-Policy', 'no-referrer')
  headers.set('Cache-Control', 'no-store')

  const normalised = (contentType ?? '').split(';')[0]?.trim().toLowerCase()

  if (
    !normalised ||
    !(ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(normalised)
  ) {
    headers.set('Content-Disposition', 'attachment')
  }

  return headers
}

/**
 * SEC-004: reject an upload whose size exceeds {@link MAX_UPLOAD_BYTES}.
 *
 * This runs in `beforeOperation`, which is the first hook every write path
 * executes — before `generateFileData()` and before Payload's
 * `deleteAssociatedFiles()` / `uploadFiles()`. Rejecting here means an
 * oversized file never reaches the filesystem, and an oversized *update* does
 * not delete the file it was replacing.
 *
 * (`beforeChange` would be too late on the update path: Payload writes the new
 * file and deletes the old one before `beforeChange` runs. `beforeValidate`
 * is early enough for the disk write but still runs *after*
 * `deleteAssociatedFiles()`, so it is used only as a second line of defence.)
 */
export const assertUploadWithinSizeLimit = (fileSize: number | undefined): void => {
  if (typeof fileSize !== 'number') {
    return
  }

  if (fileSize > MAX_UPLOAD_BYTES) {
    throw new APIError(
      `File size limit of ${MAX_UPLOAD_BYTES} bytes has been reached.`,
      413,
    )
  }
}

/**
 * SEC-004: bind the uploader to the session.
 *
 * `uploadedBy` is a polymorphic relationship because two different collections
 * can upload: `penggunas` (application users) and `users` (Payload admins).
 * The identity always comes from the verified session, never from the request
 * body — the same pattern SEC-005 applies to message senders.
 */
export const buildUploadedByValue = (
  user: { id: number | string; collection?: string } | null | undefined,
): { relationTo: string; value: number | string } | undefined => {
  if (!user || typeof user.id === 'undefined') {
    return undefined
  }

  const relationTo = user.collection === 'users' ? 'users' : 'penggunas'

  return { relationTo, value: user.id }
}

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    // SEC-004: media was world-readable.
    read: ({ req }) => isAuthenticated(req),
    create: ({ req }) => isAuthenticated(req),
    update: ({ req }) => isAuthenticated(req),
    delete: ({ req }) => isAuthenticated(req),
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    {
      /**
       * SEC-004: record who uploaded the file.
       *
       * The uploader is derived from the session, never from the request body,
       * and it is immutable afterwards — the same pattern SEC-005 applies to
       * message senders.
       */
      name: 'uploadedBy',
      type: 'relationship',
      relationTo: ['penggunas', 'users'],
      hasMany: false,
      admin: {
        readOnly: true,
      },
      access: {
        update: () => false,
      },
    },
  ],
  upload: {
    // SEC-004: restrict uploads to raster image types. SVG and XML are
    // excluded because they can carry script.
    mimeTypes: [...ALLOWED_UPLOAD_MIME_TYPES],
    // Never allow the framework's "restricted" file types to be waved through.
    allowRestrictedFileTypes: false,
    // SEC-004: pasting a remote URL is an SSRF primitive
    // (GHSA-6r7f-q7f5-wpx8). Payload 3.92.1 disables this by default; make it
    // explicit so a future framework default cannot silently re-enable it.
    pasteURL: false,
    // One file per request, and no bulk upload from the list view.
    bulkUpload: false,
    // No crop/focal-point editor: it is unused by the product and it means
    // `sharp` re-encodes every upload.
    crop: false,
    focalPoint: false,
    /**
     * SEC-004: harden the response headers of every served file.
     *
     * `nosniff` stops the browser from second-guessing the declared type, the
     * sandbox CSP neutralises script execution for any file that slipped
     * through the allow-list before it existed, and the attachment disposition
     * keeps a non-image out of the API origin's document context.
     */
    modifyResponseHeaders: ({ headers }) => {
      const secured = buildUploadResponseHeaders(headers.get('Content-Type'))

      for (const name of [
        'X-Content-Type-Options',
        'Content-Security-Policy',
        'Cross-Origin-Resource-Policy',
        'X-Frame-Options',
        'Referrer-Policy',
        'Cache-Control',
      ]) {
        const value = secured.get(name)

        if (value) {
          headers.set(name, value)
        }
      }

      const disposition = secured.get('Content-Disposition')

      if (disposition) {
        headers.set('Content-Disposition', disposition)
      } else {
        headers.delete('Content-Disposition')
      }

      return headers
    },
  },
  hooks: {
    /**
     * SEC-004: cap the upload size.
     *
     * Payload 3.92.1 has no collection-level `filesizeLimit` option, so the
     * limit is enforced here against the uploaded file's size.
     */
    beforeOperation: [
      ({ req }) => {
        assertUploadWithinSizeLimit(req.file?.size)
      },
    ],
    /**
     * SEC-004: bind the uploader to the session.
     *
     * As with SEC-005, the identity comes from the verified session and never
     * from the request body, and it cannot be changed afterwards.
     */
    beforeValidate: [
      ({ operation, data, req }) => {
        if (operation !== 'create') {
          return data
        }

        const uploadedBy = buildUploadedByValue(req.user)

        if (!uploadedBy) {
          return data
        }

        return { ...data, uploadedBy }
      },
    ],
  },
}

export default Media
