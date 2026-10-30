/**
 * SEC-004 — quarantine legacy uploads.
 *
 * ## Why this script exists
 *
 * The SEC-004 fix (type allow-list, size cap, `nosniff`, sandbox CSP,
 * `Content-Disposition: attachment`, dedicated upload origin) stops *new*
 * dangerous uploads. It does not remove the ones that are already stored:
 * an `.svg` uploaded before the allow-list existed is still on disk and is
 * still served by `GET /api/media/file/<name>` with `Content-Type:
 * image/svg+xml`.
 *
 * The response headers make such a file harmless — the sandbox CSP puts it in
 * an opaque origin and `Content-Disposition: attachment` forces a download —
 * but "harmless because of headers" is a weaker guarantee than "not there".
 * This script removes the legacy files outright.
 *
 * ## What it does
 *
 * 1. Lists every document in the `media` collection.
 * 2. For each document whose stored `mimeType` is **not** one of the four
 *    allowed raster types, it deletes the file from disk and the document from
 *    the database.
 * 3. It also removes files on disk that no longer have a matching document
 *    (orphans from a previous cleanup, or from an aborted write).
 *
 * The documents it deletes are reported. It runs in **dry-run mode by
 * default** — nothing is removed until you pass `--apply`.
 *
 * ## Before you run it
 *
 * Take a backup of both the database and the upload directory:
 *
 * ```bash
 * mongodump --uri="$DATABASE_URI" --archive=media-backup.archive
 * tar czf media-files-backup.tar.gz media/
 * ```
 *
 * ## Usage
 *
 * ```bash
 * # Dry run — lists what would be removed.
 * npx tsx scripts/quarantine-legacy-media.ts
 *
 * # Actually remove it.
 * npx tsx scripts/quarantine-legacy-media.ts --apply
 * ```
 *
 * The environment (`DATABASE_URI`, `PAYLOAD_SECRET`) is read from `.env`.
 */

import fs from 'node:fs/promises'
import path from 'node:path'

import { getPayload } from 'payload'

import config from '../src/payload.config'
import { ALLOWED_UPLOAD_MIME_TYPES } from '../src/collections/Media'

type MediaDoc = {
  id: string
  filename?: string | null
  mimeType?: string | null
  filesize?: number | null
  sizes?: Record<string, { filename?: string | null }> | null
}

const APPLY = process.argv.includes('--apply')

/** The upload directory, relative to the `payload-be` working directory. */
const MEDIA_DIR = path.resolve(process.cwd(), 'media')

const isAllowedMimeType = (mimeType: string | null | undefined): boolean => {
  if (!mimeType) {
    return false
  }

  const normalised = mimeType.split(';')[0]?.trim().toLowerCase() ?? ''

  return (ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(normalised)
}

/** Remove a file, but only if it really is inside the media directory. */
const removeFile = async (filename: string | null | undefined): Promise<boolean> => {
  if (!filename) {
    return false
  }

  const resolved = path.resolve(MEDIA_DIR, filename)

  if (!resolved.startsWith(MEDIA_DIR + path.sep)) {
    console.warn(`  ! skipped suspicious filename: ${filename}`)
    return false
  }

  try {
    await fs.unlink(resolved)
    return true
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false
    }

    throw error
  }
}

const main = async (): Promise<void> => {
  const payload = await getPayload({ config })

  const result = await payload.find({
    collection: 'media',
    depth: 0,
    limit: 1000,
    overrideAccess: true,
    pagination: false,
  })

  const docs = result.docs as unknown as MediaDoc[]

  console.log(`Found ${docs.length} document(s) in the \`media\` collection.`)
  console.log(`Mode: ${APPLY ? 'APPLY (files and documents will be removed)' : 'DRY RUN'}`)
  console.log('')

  const quarantinedDocIds: string[] = []
  const removedFilenames: string[] = []

  for (const doc of docs) {
    if (isAllowedMimeType(doc.mimeType)) {
      continue
    }

    const filenames = [
      doc.filename,
      ...Object.values(doc.sizes ?? {}).map((size) => size?.filename),
    ].filter((name): name is string => Boolean(name))

    console.log(
      `Quarantining ${doc.id} — mimeType=${doc.mimeType ?? '(none)'} file(s)=${filenames.join(', ') || '(none)'}`,
    )

    if (APPLY) {
      for (const filename of filenames) {
        const removed = await removeFile(filename)

        if (removed) {
          removedFilenames.push(filename)
        }
      }

      await payload.delete({
        id: doc.id,
        collection: 'media',
        overrideAccess: true,
      })

      quarantinedDocIds.push(doc.id)
    }
  }

  // Orphan files on disk that no document refers to.
  const knownFilenames = new Set<string>()

  for (const doc of docs) {
    if (doc.filename) {
      knownFilenames.add(doc.filename)
    }

    for (const size of Object.values(doc.sizes ?? {})) {
      if (size?.filename) {
        knownFilenames.add(size.filename)
      }
    }
  }

  let diskEntries: string[] = []

  try {
    diskEntries = await fs.readdir(MEDIA_DIR)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error
    }

    console.log(`No media directory at ${MEDIA_DIR} — nothing to scan.`)
  }

  const orphans = diskEntries.filter((entry) => !knownFilenames.has(entry))

  if (orphans.length > 0) {
    console.log('')
    console.log(`Found ${orphans.length} orphan file(s) with no matching document:`)

    for (const orphan of orphans) {
      console.log(`  - ${orphan}`)

      if (APPLY) {
        const removed = await removeFile(orphan)

        if (removed) {
          removedFilenames.push(orphan)
        }
      }
    }
  }

  console.log('')

  if (!APPLY) {
    console.log('Dry run complete. Re-run with --apply to remove the files and documents.')

    return
  }

  console.log(
    `Removed ${quarantinedDocIds.length} document(s) and ${removedFilenames.length} file(s).`,
  )

  await payload.destroy()
}

main()
  .then(() => {
    process.exit(0)
  })
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
