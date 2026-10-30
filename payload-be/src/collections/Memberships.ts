import type { CollectionConfig } from 'payload'

import { getSessionUser, isAuthenticated } from '../access'

const Memberships: CollectionConfig = {
  slug: 'memberships',
  admin: {
    useAsTitle: 'channel_id',
  },
  access: {
    // SEC-002: anonymous membership creation.
    create: ({ req }) => isAuthenticated(req),
    // Memberships are visible to any authenticated user.
    read: ({ req }) => isAuthenticated(req),
    // Memberships are not editable.
    update: ({ req }) => isAuthenticated(req),
    // SEC-004: a caller may only remove their own membership.
    delete: ({ req }) => {
      const user = getSessionUser(req)

      if (!user) {
        return false
      }

      return {
        pengguna_id: {
          equals: user.id,
        },
      }
    },
  },
  hooks: {
    /**
     * SEC-004: a caller may only add themselves to a channel.
     *
     * The client used to POST `pengguna_id` itself, which let any user force
     * another account into a channel.
     */
    beforeChange: [
      ({ operation, data, req }) => {
        if (operation !== 'create') {
          return data
        }

        if (!req.user) {
          return data
        }

        return { ...data, pengguna_id: req.user.id }
      },
    ],
  },
  fields: [
    {
      name: 'pengguna_id',
      type: 'relationship',
      relationTo: 'penggunas',
      required: true,
      access: {
        update: () => false,
      },
    },
    {
      name: 'channel_id',
      type: 'relationship',
      relationTo: 'channels',
      required: true,
    },
  ],
}

export default Memberships
