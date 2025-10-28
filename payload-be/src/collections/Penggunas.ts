import { CollectionConfig } from 'payload'

export const Penggunas: CollectionConfig = {
  slug: 'penggunas',
  auth: true,
  admin: {
    useAsTitle: 'email',
  },
  access: {
    create : ()=> true,
    read: () => true,
    update: ()=> true,
  },
  fields: [
    {
        name: 'username',
        type: 'text'
    },
    // Email added by default
    // Add more fields as needed
  ],
}

export default Penggunas
