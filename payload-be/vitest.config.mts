import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    setupFiles: ['./vitest.setup.ts'],
    projects: [
      {
        // Integration tests exercise the real Payload instance, the MongoDB
        // adapter and the auth/JWT machinery. They must run in the Node
        // environment: under `jsdom`, `TextEncoder` produces a `Uint8Array`
        // from a different realm, which makes `jose` reject the signing key
        // with "payload must be an instance of Uint8Array".
        plugins: [tsconfigPaths()],
        test: {
          name: 'int',
          environment: 'node',
          setupFiles: ['./vitest.setup.ts'],
          include: ['tests/int/**/*.int.spec.ts', 'tests/int/**/*.spec.ts'],
        },
      },
    ],
  },
})
