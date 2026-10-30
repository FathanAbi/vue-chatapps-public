import { Forbidden, type CollectionConfig, type PayloadRequest } from 'payload'

import { getSessionUser, isAuthenticated } from '../access'

/**
 * Resolve the ids of the channels the given user is a member of.
 *
 * Reads of `messages` are scoped to these channels so that a non-member cannot
 * read another channel's history (SEC-003, T-AUTHZ-08). The membership lookup
 * uses `overrideAccess: true` because this check *is* the authorization
 * decision — the caller must not be able to influence which memberships are
 * considered.
 */
const memberChannelIds = async (req: PayloadRequest, userId: number | string): Promise<(number | string)[]> => {
  const result = await req.payload.find({
    collection: 'memberships',
    depth: 0,
    limit: 0,
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      pengguna_id: {
        equals: userId,
      },
    },
  })

  return result.docs
    .map((doc) => {
      const channel = (doc as { channel_id?: unknown }).channel_id

      if (channel && typeof channel === 'object' && 'id' in channel) {
        return (channel as { id: number | string }).id
      }

      return channel as number | string | undefined
    })
    .filter((id): id is number | string => id !== undefined && id !== null)
}

/**
 * `true` (or a `where`) when the caller is a member of the target channel.
 *
 * Used at creation time: a user may only post into a channel they have joined.
 */
const isMemberOfChannel = async (
  req: PayloadRequest,
  userId: number | string,
  channelId: unknown,
): Promise<boolean> => {
  if (channelId === undefined || channelId === null) {
    return false
  }

  const resolvedChannelId =
    typeof channelId === 'object' && 'id' in channelId
      ? (channelId as { id: number | string }).id
      : (channelId as number | string)

  const membership = await req.payload.find({
    collection: 'memberships',
    depth: 0,
    limit: 1,
    overrideAccess: true,
    pagination: false,
    req,
    where: {
      and: [
        { pengguna_id: { equals: userId } },
        { channel_id: { equals: resolvedChannelId } },
      ],
    },
  })

  return membership.totalDocs > 0
}

const Messages: CollectionConfig = {
  slug: 'messages',
  admin: {
    useAsTitle: 'message',
  },
  access: {
    // SEC-002: anonymous message creation. Creation additionally requires
    // channel membership (enforced by the beforeChange hook).
    create: ({ req }) => isAuthenticated(req),
    // SEC-003 / T-AUTHZ-08: messages are readable by channel members only.
    // The result is scoped to the channels the caller belongs to.
    read: async ({ req }) => {
      const user = getSessionUser(req)

      if (!user) {
        return false
      }

      const channelIds = await memberChannelIds(req, user.id)

      // A user with no memberships sees no messages.
      return {
        Channel: {
          in: channelIds.length > 0 ? channelIds : ['__no_membership__'],
        },
      }
    },
    // Only the sender may edit a message.
    update: ({ req }) => {
      const user = getSessionUser(req)

      if (!user) {
        return false
      }

      return {
        Sender: {
          equals: user.id,
        },
      }
    },
    // Only the sender may delete a message.
    delete: ({ req }) => {
      const user = getSessionUser(req)

      if (!user) {
        return false
      }

      return {
        Sender: {
          equals: user.id,
        },
      }
    },
  },
  hooks: {
    /**
     * SEC-005: the sender is derived from the session, never from the request body.
     *
     * The client used to POST `Sender` itself, which let any caller write a
     * message in somebody else's name.
     */
    beforeChange: [
      async ({ operation, data, req }) => {
        if (operation !== 'create') {
          return data
        }

        if (!req.user) {
          return data
        }

        // SEC-003 / T-AUTHZ-09: a user may only post into a channel they have
        // joined. `data.Channel` is the client-supplied channel id.
        const isMember = await isMemberOfChannel(
          req,
          req.user.id as number | string,
          (data as { Channel?: unknown }).Channel,
        )

        if (!isMember) {
          throw new Forbidden(req.t)
        }

        return { ...data, Sender: req.user.id }
      },
    ],
  },
  fields: [
    {
      name: 'Sender',
      type: 'relationship',
      relationTo: 'penggunas',
      required: true,
      access: {
        update: () => false,
      },
    },
    {
      name: 'Channel',
      type: 'relationship',
      relationTo: 'channels',
      required: true,
    },
    {
      name: 'message',
      type: 'text',
      required: true,
    },
  ],
}

export default Messages
