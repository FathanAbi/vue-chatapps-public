import { nodemailerAdapter } from '@payloadcms/email-nodemailer'

import { APP_URL } from './env'

/**
 * SEC-010 / B1: the email transport.
 *
 * Account verification (`penggunas.auth.verify`) and the password-reset flow
 * both require an email adapter. This helper wires `@payloadcms/email-nodemailer`
 * when the SMTP environment is present, and otherwise returns `undefined` so
 * that local development (and the integration tests) keep working without an
 * SMTP server — Payload then logs the outbound mail instead of sending it.
 *
 * Environment:
 *   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
 */
const readSmtp = () => {
  const host = (process.env.SMTP_HOST ?? '').trim()

  if (!host) {
    return null
  }

  const port = Number((process.env.SMTP_PORT ?? '').trim() || 587)
  const user = (process.env.SMTP_USER ?? '').trim()
  const pass = (process.env.SMTP_PASS ?? '').trim()
  const fromAddress = (process.env.SMTP_FROM ?? 'no-reply@example.com').trim()

  return {
    auth: user ? { user, pass } : undefined,
    defaultFromAddress: fromAddress,
    defaultFromName: (process.env.SMTP_FROM_NAME ?? 'Aplikasi Chat').trim(),
    host,
    port,
    secure: port === 465,
  }
}

export const buildEmailAdapter = () => {
  const smtp = readSmtp()

  if (!smtp) {
    return undefined
  }

  return nodemailerAdapter(smtp)
}

/** Build the SPA-facing password-reset link for a given token. */
export const buildPasswordResetLink = (token: string): string =>
  `${APP_URL}/reset-password?token=${encodeURIComponent(token)}`

/**
 * B1: the password-reset email body.
 *
 * Payload calls this with the generated `token`; the link points at the SPA's
 * reset view. When no SMTP transport is configured the outbound mail would be
 * lost, so in non-production environments the link is also printed to the
 * server console — this is the documented dev fallback for completing the
 * reset flow without an email provider.
 */
export const buildPasswordResetEmailHTML = (args?: { token?: string }): string => {
  const token = args?.token ?? ''
  const link = buildPasswordResetLink(token)

  if (!readSmtp() && process.env.NODE_ENV !== 'production') {
    // Deliberately console-only and non-production: a production deployment
    // without SMTP will not silently leak a usable reset link.
    console.log(
      `\n[dev] Password reset link (no SMTP configured):\n  ${link}\n`,
    )
  }

  return `
    <p>You requested a password reset.</p>
    <p>Click the link below to choose a new password. This link expires in one hour.</p>
    <p><a href="${link}">${link}</a></p>
    <p>If you did not request this, you can ignore this email.</p>
  `
}
