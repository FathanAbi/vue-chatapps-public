import type { Access, FieldAccess, PayloadRequest } from 'payload'

/**
 * Shared access-control helpers.
 *
 * SEC-001: the previous configuration used constant `() => true` access functions on
 * every collection, which allowed any caller (including anonymous ones) to read,
 * update or delete arbitrary documents — including the `password` of any account.
 *
 * Every helper below is deliberately shaped so that it can be unit-tested without a
 * running Payload instance.
 */

/** The admin collection slug. Members of this collection are Payload admins. */
export const ADMIN_COLLECTION = 'users'

/** The application ("pengguna") collection slug. */
export const PENGGUNA_COLLECTION = 'penggunas'

/** Narrow an unknown request user to a typed user object. */
export type SessionUser = {
  id: number | string
  collection?: string
}

/**
 * Return the authenticated user for the request, or `null`.
 *
 * Payload sets `req.user` for every authenticated request regardless of which
 * collection the account belongs to, so callers must additionally check
 * `user.collection` when the distinction matters.
 */
export const getSessionUser = (req: PayloadRequest): SessionUser | null => {
  const { user } = req

  if (!user || typeof user !== 'object' || !('id' in user)) {
    return null
  }

  return user as unknown as SessionUser
}

/** Role values recognised on the `users` (admin) collection. */
export const ADMIN_ROLE = 'admin'
export const USER_ROLE = 'user'

/**
 * `true` when the request carries a Payload admin session with the `admin` role.
 *
 * B3 / SEC-018: reaching the `users` collection is no longer sufficient to be
 * treated as an administrator. A `users` document must additionally carry the
 * `admin` role, so that ordinary operators can exist on the admin collection
 * without inheriting full administrative privileges. Every privileged branch in
 * this application keys off this predicate.
 */
export const isAdmin = (req: PayloadRequest): boolean => {
  const user = getSessionUser(req)

  if (!user || user.collection !== ADMIN_COLLECTION) {
    return false
  }

  const roles = (user as { roles?: unknown }).roles

  return Array.isArray(roles) && roles.includes(ADMIN_ROLE)
}

/**
 * `true` when the request carries an application ("pengguna") session.
 */
export const isPengguna = (req: PayloadRequest): boolean => {
  const user = getSessionUser(req)

  return Boolean(user && user.collection === PENGGUNA_COLLECTION)
}

/**
 * `true` when the request is authenticated as *any* collection.
 */
export const isAuthenticated = (req: PayloadRequest): boolean => getSessionUser(req) !== null

/**
 * Resolve the id of the document an access/field-access function is being asked about.
 *
 * Field-level access functions receive `id` on updates but only `doc` on some read
 * paths, so both are consulted.
 */
export const resolveDocumentId = (
  id: number | string | undefined,
  doc?: { id?: number | string } | null,
): number | string | undefined => {
  if (id !== undefined && id !== null) {
    return id
  }

  if (doc && doc.id !== undefined && doc.id !== null) {
    return doc.id
  }

  return undefined
}

/**
 * `true` when the authenticated session belongs to the given document id.
 */
export const isSelf = (req: PayloadRequest, id: number | string | undefined): boolean => {
  const user = getSessionUser(req)

  if (!user || id === undefined || id === null) {
    return false
  }

  return String(user.id) === String(id)
}

/**
 * Read access for the `penggunas` collection.
 *
 * Any authenticated account may read `penggunas` documents: the chat UI relies on
 * reading other participants' profiles (usernames) to render messages and to build
 * the directory. The sensitive part — the email address — is protected separately by
 * a field-level access rule (see `penggunaEmailReadAccess`), so a user listing the
 * collection learns usernames but not anybody's address.
 */
export const penggunaReadAccess: Access = ({ req }) => isAuthenticated(req)

/**
 * Update access for the `penggunas` collection: self-service only.
 *
 * Application users may only modify their own document. Payload admins are
 * allowed as well, because the Admin Panel has to be able to administer
 * application accounts — but the `password` field carries its own field-level
 * rule (`penggunaPasswordUpdateAccess`), so an admin can change somebody else's
 * password *deliberately*, not as a side effect of a blanket grant.
 */
export const penggunaUpdateAccess: Access = ({ req }) => {
  if (isAdmin(req)) {
    return true
  }

  const user = getSessionUser(req)

  if (!user) {
    return false
  }

  return {
    id: {
      equals: user.id,
    },
  }
}

/**
 * Delete access for the `penggunas` collection: self-service only.
 */
export const penggunaDeleteAccess: Access = penggunaUpdateAccess

/**
 * Create access for the `penggunas` collection: open registration.
 *
 * Account creation policy (password strength, username uniqueness, rate limiting)
 * is handled separately; see remediation task A6.
 */
export const penggunaCreateAccess: Access = () => true

/**
 * Field-level read access for `penggunas.email`.
 *
 * A user may always see their own email address. Other users' addresses are only
 * visible to Payload admins. This is what keeps the chat directory from leaking
 * every registered account's address to every authenticated user (SEC-013).
 */
export const penggunaEmailReadAccess: FieldAccess = ({ req, id, doc }) => {
  if (isAdmin(req)) {
    return true
  }

  return isSelf(req, resolveDocumentId(id, doc))
}

/**
 * Field-level update access for `penggunas.email`.
 *
 * Only the account owner (or an admin) may change the address on their account.
 */
export const penggunaEmailUpdateAccess: FieldAccess = ({ req, id, doc }) => {
  if (isAdmin(req)) {
    return true
  }

  return isSelf(req, resolveDocumentId(id, doc))
}

/**
 * Field-level update access for `penggunas.password`.
 *
 * This is the second, independent guard on SEC-001. Payload >= 3.90.0 enforces
 * field-level access on the `password` field (GHSA-fx49-4h83-wjv9), but the
 * framework only enforces it when the field is *declared* on the collection, so
 * `Penggunas.ts` must declare it explicitly.
 *
 * The rule: an account owner may change their own password, an admin may change
 * any password. Everybody else is denied — which is what stops user A from
 * taking over user B's account by sending `PATCH /api/penggunas/<B>` with a
 * `password` field.
 */
export const penggunaPasswordUpdateAccess: FieldAccess = ({ req, id, doc }) => {
  if (isAdmin(req)) {
    return true
  }

  return isSelf(req, resolveDocumentId(id, doc))
}

/**
 * Field-level read access for `penggunas.username`.
 *
 * Usernames are the public identity of a chat participant, so they remain
 * readable by any authenticated application user. The email address is the
 * sensitive identifier and is handled separately.
 */
export const penggunaUsernameReadAccess: FieldAccess = ({ req }) => isAuthenticated(req)

/**
 * Field-level update access for `penggunas.username`.
 *
 * Only the account owner may change their own display name.
 */
export const penggunaUsernameUpdateAccess: FieldAccess = ({ req, id, doc }) =>
  isSelf(req, resolveDocumentId(id, doc))

/**
 * Constrain an operation to the documents owned by the caller.
 *
 * Returns `false` for anonymous callers and a `where` constraint that scopes the
 * operation to the caller's own documents otherwise.
 */
export const ownedByCaller = (field: string) => {
  return ({ req }: { req: PayloadRequest }) => {
    const user = getSessionUser(req)

    if (!user) {
      return false
    }

    return {
      [field]: {
        equals: user.id,
      },
    }
  }
}
