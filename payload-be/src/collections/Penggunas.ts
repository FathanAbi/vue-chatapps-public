import { APIError, Forbidden, type CollectionConfig } from 'payload'

import {
  penggunaCreateAccess,
  penggunaDeleteAccess,
  penggunaEmailReadAccess,
  penggunaEmailUpdateAccess,
  penggunaPasswordUpdateAccess,
  penggunaReadAccess,
  penggunaUpdateAccess,
  penggunaUsernameReadAccess,
  penggunaUsernameUpdateAccess,
} from '../access'
import { directoryEndpoint } from '../endpoints/directory'
import { buildPasswordResetEmailHTML } from '../config/email'
import { COOKIES_SECURE } from '../config/env'

/** SEC-010: minimum accepted password length. */
const MIN_PASSWORD_LENGTH = 8

export const Penggunas: CollectionConfig = {
  slug: 'penggunas',
  auth: {
    // SEC-008: cookies must carry `Secure` and `HttpOnly` over TLS.
    cookies: {
      secure: COOKIES_SECURE,
      sameSite: 'Lax',
    },
    // SEC-010 / B1: email verification is intentionally **disabled**. The
    // product decision (Stage B) is that registration stays open and a new
    // account may log in immediately; the abuse control for open registration
    // is the edge rate limiting added in task A8, not a verification gate.
    verify: false,
    // SEC-007: cap failed attempts so a distributed attack cannot brute-force a
    // password indefinitely (paired with edge rate limiting, task A8).
    maxLoginAttempts: 5,
    tokenExpiration: 60 * 60 * 24 * 7,
    // B1: password recovery runs through the email reset flow. The link points
    // at the SPA (see ../config/email.ts), and the dev-only console fallback
    // prints it when no SMTP transport is configured.
    forgotPassword: {
      expiration: 1000 * 60 * 60, // 1 hour
      generateEmailHTML: buildPasswordResetEmailHTML,
      generateEmailSubject: () => 'Reset your password',
    },
  },
  admin: {
    useAsTitle: 'email',
  },
  access: {
    // Registration stays open (password policy is enforced separately).
    create: penggunaCreateAccess,
    // Any authenticated account may read profiles. The email address of other
    // users is withheld by the field-level rule on `email` below.
    read: penggunaReadAccess,
    // Self-service only. This is the collection that SEC-001 was exploited through.
    update: penggunaUpdateAccess,
    delete: penggunaDeleteAccess,
  },
  endpoints: [directoryEndpoint],
  fields: [
    {
      name: 'username',
      type: 'text',
      // SEC-010: usernames are the public identity of a participant and must be
      // unique, present, and constrained to a safe character set.
      required: true,
      unique: true,
      index: true,
      validate: (value: unknown): true | string => {
        if (typeof value !== 'string' || !/^[a-z0-9_]{3,24}$/.test(value)) {
          return 'Username must be 3-24 characters, using lowercase letters, digits and underscores only.'
        }

        return true
      },
      access: {
        read: penggunaUsernameReadAccess,
        update: penggunaUsernameUpdateAccess,
      },
    },
    {
      name: 'email',
      type: 'email',
      access: {
        read: penggunaEmailReadAccess,
        update: penggunaEmailUpdateAccess,
      },
    },
    {
      // The `password` field is not a stored field: Payload hashes it into
      // `hash`/`salt`. It must nevertheless be *declared* for the field-level
      // `update` access rule to be enforced by the framework.
      //
      // Payload >= 3.90.0 (GHSA-fx49-4h83-wjv9) enforces field-level access on
      // `data.password` during `updateDocument`. Before that fix, any caller with
      // collection-level update access could rewrite another account's password
      // and take the account over.
      name: 'password',
      type: 'text',
      hidden: true,
      access: {
        update: penggunaPasswordUpdateAccess,
      },
    },
  ],
  hooks: {
    /**
     * SEC-010: enforce a minimum password length.
     *
     * Payload's built-in minimum is 3 characters. A password is only present
     * on `create` and on a deliberate password change, so the check is applied
     * whenever `data.password` is a string.
     */
    beforeValidate: [
      async ({ data, originalDoc, req }) => {
        const password = (data as { password?: unknown } | undefined)?.password

        if (typeof password === 'string' && password.length < MIN_PASSWORD_LENGTH) {
          throw new APIError(
            `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`,
            400,
          )
        }

        // SEC-010: enforce username uniqueness at the application layer as well
        // as through the database index. The index is built asynchronously at
        // startup, so on a fresh database the very first duplicate insert can
        // otherwise slip through before the index exists.
        const username = (data as { username?: unknown } | undefined)?.username

        if (typeof username === 'string') {
          const existing = await req.payload.find({
            collection: 'penggunas',
            depth: 0,
            limit: 1,
            overrideAccess: true,
            pagination: false,
            req,
            where: { username: { equals: username } },
          })

          // Determine the document being updated so the account's *own*
          // username is not treated as a clash. `originalDoc` is absent on the
          // token-authorized reset path, where the full user document (with its
          // `id`) arrives as `data`.
          const selfId = originalDoc?.id ?? (data as { id?: number | string } | undefined)?.id

          const clash = existing.docs.find(
            (doc) =>
              String((doc as { id: number | string }).id) !== String(selfId) ||
              selfId === undefined,
          )

          if (clash) {
            throw new APIError('This username is already taken.', 400)
          }
        }

        return data
      },
    ],
    /**
     * Defence in depth for SEC-001 (remediation task A2).
     *
     * The field-level access rule above already prevents a caller from writing
     * another account's password. This hook is a second, independent guard that
     * does not depend on the framework version and that also covers the
     * `overrideAccess` code paths.
     *
     * It is deliberately narrow: the takeover this guards against is an
     * **authenticated** caller writing a password they are not entitled to
     * write. Two other paths legitimately carry a `password`:
     *   - `create` (registration) — always allowed.
     *   - the token-authorized password reset (`auth.forgotPassword` →
     *     `resetPassword`), which runs with **no** `req.user`. Payload validates
     *     the single-use, time-boxed reset token before reaching this hook, so an
     *     update with no session is only reachable through that flow.
     *
     * Therefore the guard only fires when a session is present and the caller is
     * neither the account owner nor an admin.
     */
    beforeChange: [
      ({ operation, data, originalDoc, req }) => {
        if (operation === 'create') {
          return data
        }

        if (!data || !('password' in data)) {
          return data
        }

        const { user } = req

        // No session: this is the token-authorized reset path (B1) or an
        // internal framework write, not a takeover attempt.
        if (!user) {
          return data
        }

        const targetId = originalDoc?.id ?? data.id

        const isOwner =
          'id' in user && targetId !== undefined && String(user.id) === String(targetId)

        const isAdminUser = user.collection === 'users'

        if (!isOwner && !isAdminUser) {
          throw new Forbidden(req.t)
        }

        return data
      },
    ],
  },
}

export default Penggunas
