import { CollectionConfig } from 'payload';

const Memberships: CollectionConfig = {
  slug: 'memberships',
  admin: {
    useAsTitle: 'channel_id',
  },
  access: {
    read: () => true,
    create: () => true,
    delete: () => true,
  },
  fields: [
    {
      name: 'pengguna_id',
      type: 'relationship',
      relationTo: 'penggunas',
      required: true,
    },
    {
      name: 'channel_id',
      type: 'relationship',
      relationTo: 'channels',
      required: true,
    },
  ],
};

export default Memberships;
