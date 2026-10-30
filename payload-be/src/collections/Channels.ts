import type { CollectionConfig } from 'payload'

import { getSessionUser, isAuthenticated } from '../access'

const Channels: CollectionConfig = {
  slug: 'channels',
  admin: {
    useAsTitle: 'channel_name',
  },
  access: {
    // SEC-002: anonymous channel creation.
    create: ({ req }) => isAuthenticated(req),
    // Channels are visible to any authenticated user.
    read: ({ req }) => isAuthenticated(req),
    // Only the channel owner may rename a channel.
    update: ({ req }) => {
      const user = getSessionUser(req)

      if (!user) {
        return false
      }

      return {
        owner: {
          equals: user.id,
        },
      }
    },
    // Only the channel owner may delete a channel.
    delete: ({ req }) => {
      const user = getSessionUser(req)

      if (!user) {
        return false
      }

      return {
        owner: {
          equals: user.id,
        },
      }
    },
  },
  hooks: {
    /**
     * SEC-005: ownership is derived from the session, never from the request body.
     */
    beforeChange: [
      ({ operation, data, req }) => {
        if (operation !== 'create') {
          return data
        }

        if (!req.user) {
          return data
        }

        return { ...data, owner: req.user.id }
      },
    ],
  },
  fields: [
    {
      name: 'channel_name',
      type: 'text',
      required: true,
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'penggunas',
      required: true,
      // SEC-005: ownership cannot be transferred by writing to the field.
      access: {
        update: () => false,
      },
    },
  ],
}

export default Channels
