// storage-adapter-import-placeholder
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media, MAX_UPLOAD_BYTES } from './collections/Media'
import { Penggunas } from './collections/Penggunas';
import { Chats } from './collections/Chats';
import Channels from './collections/Channels';
import Memberships from './collections/Memberships';
import Messages from './collections/Messages';
import { CORS_ORIGINS, CSRF_ORIGINS, SERVER_URL, requireEnv } from './config/env'
import { buildEmailAdapter } from './config/email'
import { healthEndpoint } from './endpoints/health'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

/**
 * SEC-008 / SEC-009: bound the length of a single text value.
 *
 * Payload's default is 40 000 characters. The product is a chat application,
 * so 2 000 is comfortably enough and it removes a cheap memory/CPU DoS.
 */
const MAX_TEXT_LENGTH = 2_000

/**
 * SEC-004: the maximum size of a multipart request body.
 *
 * Payload's own default is 50 MB per request and 20 MB per file. The
 * collection-level limit (`MAX_UPLOAD_BYTES`) is 5 MB, so the parser is
 * configured just above it: an oversized body is rejected with a 413 by the
 * multipart parser — before the bytes are buffered and before any hook runs —
 * while the collection hook remains the authoritative per-file check.
 */
const MAX_REQUEST_SIZE_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  // SEC-008: origins come from the environment (`FRONTEND_ORIGINS`,
  // `SERVER_URL`), never from a hard-coded address. See src/config/env.ts.
  serverURL: SERVER_URL || undefined,
  cors: CORS_ORIGINS,
  csrf: CSRF_ORIGINS,
  /**
   * SEC-004: bound the multipart upload pipeline at the parser.
   *
   * - `limits.fileSize` — a single file may not exceed the collection limit.
   * - `limits.files`   — one file per request.
   * - `requestSizeLimit` — a hard ceiling on the whole request body.
   * - `useTempFiles` — stream the body to disk instead of buffering it in
   *   memory, so a large upload cannot exhaust the Node heap.
   */
  upload: {
    abortOnLimit: true,
    limits: {
      fileSize: MAX_UPLOAD_BYTES,
      files: 1,
    },
    requestSizeLimit: MAX_REQUEST_SIZE_BYTES,
    responseOnLimit: 'File size limit has been reached',
    useTempFiles: true,
    tempFileDir: 'tmp',
  },
  collections: [Users, Media, Penggunas, Chats, Channels,
    Memberships,
    Messages],
  // B4 / SEC-017: `/api/health` performs a DB round-trip for the container
  // healthcheck and the deployment-guide liveness probe.
  endpoints: [healthEndpoint],
  editor: lexicalEditor(),
  // SEC-010 / B1: account verification needs an email transport. Configured
  // from SMTP_* environment variables; omitted when they are absent.
  email: buildEmailAdapter(),
  // SEC-008: fail fast (with a message naming the variable) rather than
  // letting an empty secret reach `buildConfig`.
  secret: requireEnv('PAYLOAD_SECRET'),
  // SEC-009: cap the length of a single text value (see MAX_TEXT_LENGTH).
  defaultMaxTextLength: MAX_TEXT_LENGTH,
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: requireEnv('DATABASE_URI'),
  }),
  // A9: the SPA does not use GraphQL, so the second full API surface is
  // disabled entirely (SEC-007 / SEC-018 residual surface).
  graphQL: {
    disable: true,
  },
  sharp,
  plugins: [
    payloadCloudPlugin(),
    // storage-adapter-placeholder
  ],
})
