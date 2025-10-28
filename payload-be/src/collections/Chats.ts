import { CollectionConfig } from 'payload'

export const Chats: CollectionConfig = {
  slug: 'chats',
  admin: {
    useAsTitle: 'sender_id',
  },
  access: {
    create : ()=> true
  },
  fields: [
    {
        name: "message",
        type: "text"
    },
    {
        name: "sender_id",
        type: "relationship",
        relationTo: "penggunas",
        hasMany: false
    },
    {
        name: "receiver_id",
        type: "relationship",
        relationTo: "penggunas",
        hasMany: false
    }
  ],
}

export default Chats
