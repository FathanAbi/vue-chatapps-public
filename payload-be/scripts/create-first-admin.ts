/**
 * A9 / SEC-007: provision the first administrator through a controlled script
 * instead of the public `first-register` flow.
 *
 * Usage:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='a-strong-password' \
 *     npx tsx scripts/create-first-admin.ts
 *
 * The script reads the environment, connects to the configured database and
 * creates a `users` document if one does not already exist. It does **not**
 * expose an HTTP endpoint, so it cannot be triggered remotely.
 */
import { getPayload } from 'payload'

import config from '../src/payload.config'

const run = async (): Promise<void> => {
  const email = (process.env.ADMIN_EMAIL ?? '').trim()
  const password = (process.env.ADMIN_PASSWORD ?? '').trim()

  if (!email || !password) {
    throw new Error('ADMIN_EMAIL and ADMIN_PASSWORD must be set to provision an admin.')
  }

  if (password.length < 8) {
    throw new Error('ADMIN_PASSWORD must be at least 8 characters long.')
  }

  const payload = await getPayload({ config })

  const existing = await payload.find({
    collection: 'users',
    limit: 1,
    overrideAccess: true,
    pagination: false,
  })

  if (existing.totalDocs > 0) {
    payload.logger.info('An admin account already exists; nothing to do.')
    return
  }

  // B3 / SEC-018: the first administrator must carry the `admin` role, otherwise
  // the role-aware `isAdmin` predicate would treat the account as an ordinary
  // operator and lock the Admin Panel out.
  await payload.create({
    collection: 'users',
    data: { email, password, roles: ['admin'] },
    overrideAccess: true,
  })

  payload.logger.info(`Provisioned administrator ${email}.`)
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
