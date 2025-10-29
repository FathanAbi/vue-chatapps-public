// storage-adapter-import-placeholder
import { mongooseAdapter } from '@payloadcms/db-mongodb'
import { payloadCloudPlugin } from '@payloadcms/payload-cloud'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Penggunas } from './collections/Penggunas';
import { Chats } from './collections/Chats';
import Channels from './collections/Channels';
import Memberships from './collections/Memberships';
import Messages from './collections/Messages';

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  cors: [
    'http://103.103.21.102:50011', // Vue frontend
    'http://localhost:50011',      // local testing
    'http://localhost:5173'        // Vite dev mode
  ],
  csrf: [
    'http://103.103.21.102:50011',
    'http://localhost:50011',
    'http://localhost:5173'
  ],
  collections: [Users, Media, Penggunas, Chats, Channels,
    Memberships,
    Messages],
  editor: lexicalEditor(),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  db: mongooseAdapter({
    url: process.env.DATABASE_URI || '',
  }),
  sharp,
  plugins: [
    payloadCloudPlugin(),
    // storage-adapter-placeholder
  ],
})
