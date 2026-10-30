import type { Endpoint, PayloadRequest } from 'payload'

import { getSessionUser } from '../access'

export type DirectoryEntry = {
  id: number | string
  username: string | null
}

/** Default number of entries per page. */
export const DEFAULT_DIRECTORY_LIMIT = 25

/** Hard ceiling on the page size, regardless of what the caller asks for. */
export const MAX_DIRECTORY_LIMIT = 50

/** Shortest search term accepted. A blank term is refused so a single request
 * cannot dump the whole collection (SEC-013). */
export const MIN_QUERY_LENGTH = 2

export type DirectoryQuery = {
  q: string
  page: number
  limit: number
}

/**
 * Parse and clamp the directory query string.
 *
 * SEC-013: the endpoint is deliberately search-based. `q` is required and must be
 * at least {@link MIN_QUERY_LENGTH} characters; `page` and `limit` are bounded so a
 * caller cannot request an unbounded listing in one request.
 *
 * Returns `null` when `q` is missing or too short — the caller turns that into a
 * 400 response.
 */
export const parseDirectoryQuery = (url: URL | string): DirectoryQuery | null => {
  const params =
    url instanceof URL
      ? url.searchParams
      : new URLSearchParams(new URL(url, 'http://localhost').search)

  const q = (params.get('q') ?? '').trim()

  if (q.length < MIN_QUERY_LENGTH) {
    return null
  }

  const rawPage = Number.parseInt(params.get('page') ?? '1', 10)
  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1

  const rawLimit = Number.parseInt(params.get('limit') ?? String(DEFAULT_DIRECTORY_LIMIT), 10)
  const limit = Math.min(
    Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_DIRECTORY_LIMIT,
    MAX_DIRECTORY_LIMIT,
  )

  return { q, page, limit }
}

/** Escape a user-supplied term so it is treated literally inside a regex. */
export const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Build the sanitized directory payload.
 *
 * Exported separately from the handler so it can be unit-tested without a running
 * Payload instance.
 *
 * The directory deliberately contains **no** email addresses: the chat UI only
 * needs a stable identifier and a display name in order to list chat partners.
 * Exposing addresses here would re-open the account-enumeration leak that SEC-013
 * describes, and it would undo the field-level rule that hides other users'
 * emails on the `penggunas` collection.
 */
export const buildDirectory = (
  docs: Array<{ id: number | string; username?: string | null }>,
): DirectoryEntry[] =>
  docs.map((doc) => ({
    id: doc.id,
    username: doc.username ?? null,
  }))

/**
 * `GET /api/penggunas/directory?q=<term>&page=<n>&limit=<n>`
 *
 * Returns matching registered application users, without email addresses.
 * Requires authentication. A search term of at least {@link MIN_QUERY_LENGTH}
 * characters is mandatory so that the endpoint cannot be used to enumerate the
 * whole collection in a single request (SEC-013).
 */
export const directoryHandler = async (req: PayloadRequest): Promise<Response> => {
  const user = getSessionUser(req)

  if (!user) {
    return Response.json(
      { errors: [{ message: 'You are not allowed to perform this action.' }] },
      { status: 403 },
    )
  }

  const query = parseDirectoryQuery(req.url ?? '/')

  if (!query) {
    return Response.json(
      {
        errors: [
          {
            message: `Provide a search term of at least ${MIN_QUERY_LENGTH} characters in the "q" parameter.`,
          },
        ],
      },
      { status: 400 },
    )
  }

  const result = await req.payload.find({
    collection: 'penggunas',
    depth: 0,
    limit: query.limit,
    overrideAccess: false,
    page: query.page,
    req,
    select: {
      username: true,
    },
    where: {
      username: {
        like: escapeRegex(query.q),
      },
    },
  })

  return Response.json(
    {
      docs: buildDirectory(result.docs as Array<{ id: number | string; username?: string | null }>),
      totalDocs: result.totalDocs,
      page: query.page,
      totalPages: result.totalPages,
      hasNextPage: result.hasNextPage,
      limit: query.limit,
    },
    { status: 200 },
  )
}

/**
 * The `penggunas` collection exposes this endpoint in addition to the standard
 * REST routes.
 */
export const directoryEndpoint: Endpoint = {
  path: '/directory',
  method: 'get',
  handler: directoryHandler,
}
