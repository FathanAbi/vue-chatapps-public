import { CollectionConfig } from 'payload';

const Channels: CollectionConfig = {
  slug: 'channels',
  admin: {
    useAsTitle: 'channel_name',
  },
  access: {
    read: () => true,
    create: () => true,
    update: () => true,
    delete: () => true,
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
    },
  ],
};

export default Channels;
