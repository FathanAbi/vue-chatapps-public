import { CollectionConfig } from 'payload';

const Messages: CollectionConfig = {
  slug: 'messages',
  admin: {
    useAsTitle: 'message',
  },
  access: {
    read: () => true,
    create: () => true,
  },
  fields: [
    { name: 'Sender', type: 'relationship', relationTo: 'penggunas', required: true },
  { name: 'Channel', type: 'relationship', relationTo: 'channels', required: true },
  { name: 'message', type: 'text', required: true },
  ],
};

export default Messages;
