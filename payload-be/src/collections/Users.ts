import type { CollectionConfig } from 'payload'

import { ADMIN_ROLE, USER_ROLE, isAdmin } from '../access'
import { COOKIES_SECURE } from '../config/env'

export const Users: CollectionConfig = {
  slug: 'users',
  admin: {
    useAsTitle: 'email',
  },
  auth: {
    // SEC-008: cookies must carry `Secure` and `HttpOnly` over TLS.
    cookies: {
      secure: COOKIES_SECURE,
      sameSite: 'Lax',
    },
  },
  access: {
    /**
     * SEC-001, second takeover path.
     *
     * The `users` collection previously declared no `access` block at all, so
     * Payload fell back to its default (`Boolean(req.user)`). Any logged-in
     * application user could therefore PATCH an admin account's `password` and
     * take over the admin panel.
     *
     * `users` is the Payload admin collection: it holds administrators, not
     * application users. It is only writable by an existing admin.
     */
    create: ({ req }) => isAdmin(req),
    read: ({ req }) => isAdmin(req),
    update: ({ req }) => isAdmin(req),
    delete: ({ req }) => isAdmin(req),
  },
  fields: [
    // Email added by default
    {
      /**
       * B3 / SEC-018: separation of duties on the admin collection.
       *
       * Membership of `users` grants access to the Admin Panel, but only the
       * `admin` role is treated as an administrator by the access functions
       * (`isAdmin`). This lets an ordinary operator account exist without
       * inheriting every privileged action.
       */
      name: 'roles',
      type: 'select',
      hasMany: true,
      defaultValue: [USER_ROLE],
      options: [
        { label: 'Admin', value: ADMIN_ROLE },
        { label: 'User', value: USER_ROLE },
      ],
      access: {
        // Only an admin may grant or revoke roles.
        update: ({ req }) => isAdmin(req),
      },
    },
  ],
}

export default Users
