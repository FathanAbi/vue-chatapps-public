import type { CollectionConfig } from 'payload'

import { getSessionUser, isAuthenticated } from '../access'

export const Chats: CollectionConfig = {
  slug: 'chats',
  admin: {
    useAsTitle: 'sender_id',
  },
  access: {
    // SEC-003: anonymous message creation. The sender is derived from the
    // session (see the beforeChange hook), so creation now requires a session.
    create: ({ req }) => isAuthenticated(req),
    // A conversation is visible only to the two participants.
    read: ({ req }) => {
      const user = getSessionUser(req)

      if (!user) {
        return false
      }

      return {
        or: [
          { sender_id: { equals: user.id } },
          { receiver_id: { equals: user.id } },
        ],
      } as const
    },
    // Only the sender may edit a conversation.
    update: ({ req }) => {
      const user = getSessionUser(req)

      if (!user) {
        return false
      }

      return {
        sender_id: {
          equals: user.id,
        },
      }
    },
    // Only the sender may delete a conversation.
    delete: ({ req }) => {
      const user = getSessionUser(req)

      if (!user) {
        return false
      }

      return {
        sender_id: {
          equals: user.id,
        },
      }
    },
  },
  hooks: {
    /**
     * SEC-005: the sender must come from the session, never from the request body.
     *
     * The client used to POST `sender_id` itself, which let any caller write a
     * message in somebody else's name.
     */
    beforeChange: [
      ({ operation, data, req }) => {
        if (!req.user) {
          return data
        }

        if (operation === 'create') {
          return { ...data, sender_id: req.user.id }
        }

        return data
      },
    ],
  },
  fields: [
    {
      name: 'message',
      type: 'text',
    },
    {
      name: 'sender_id',
      type: 'relationship',
      relationTo: 'penggunas',
      hasMany: false,
      required: true,
      // SEC-005: the sender is immutable once the message exists.
      access: {
        update: () => false,
      },
    },
    {
      name: 'receiver_id',
      type: 'relationship',
      relationTo: 'penggunas',
      hasMany: false,
    },
  ],
}

export default Chats
