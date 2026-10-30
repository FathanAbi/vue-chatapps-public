/**
 * Environment-driven configuration helpers (remediation task A5, SEC-008).
 *
 * The previous configuration hard-coded a plain-HTTP deployment address in both
 * `cors` and `csrf`, never set a `serverURL`, and let an empty `PAYLOAD_SECRET`
 * reach `buildConfig`. Every
 * helper here reads from the environment instead, and the secret is validated
 * eagerly so the process fails with an actionable message rather than a
 * confusing framework error later on.
 */

const splitList = (value: string | undefined): string[] =>
  (value ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

/** The canonical API origin, e.g. `https://api.example.com`. Empty if unset. */
export const SERVER_URL = (process.env.SERVER_URL ?? '').trim()

/**
 * Origins allowed for CORS and CSRF.
 *
 * Both lists start from `FRONTEND_ORIGINS` and, when a `serverURL` is
 * configured, that origin is appended to the CSRF allow-list as well (Payload's
 * own convention: the admin panel is served from the API origin).
 */
export const FRONTEND_ORIGINS = splitList(process.env.FRONTEND_ORIGINS)

export const CORS_ORIGINS = FRONTEND_ORIGINS

export const CSRF_ORIGINS = Array.from(
  new Set([...FRONTEND_ORIGINS, ...(SERVER_URL ? [SERVER_URL] : [])]),
)

/**
 * Base URL used to build SPA-facing links in outbound email (B1).
 *
 * The password-reset email points at the SPA, not the API, so the reset link is
 * `${APP_URL}/reset-password?token=...`. It falls back to the first configured
 * frontend origin (there is normally exactly one), then to localhost for local
 * development, so the dev console fallback always produces a usable link.
 */
export const APP_URL = (() => {
  const explicit = (process.env.APP_URL ?? '').trim()

  if (explicit) {
    return explicit.replace(/\/+$/, '')
  }

  if (FRONTEND_ORIGINS.length > 0) {
    return FRONTEND_ORIGINS[0].replace(/\/+$/, '')
  }

  return 'http://localhost:5173'
})()

/** `true` when the deployment terminates TLS (so cookies must carry `Secure`). */
export const COOKIES_SECURE = (() => {
  const raw = (process.env.COOKIE_SECURE ?? '').trim().toLowerCase()

  if (raw === 'true') {
    return true
  }

  if (raw === 'false') {
    return false
  }

  // Default: secure unless the app is explicitly running on a plain-HTTP dev URL.
  return SERVER_URL.startsWith('https://') || process.env.NODE_ENV === 'production'
})()

/**
 * Read a required environment variable, throwing a message that names it.
 *
 * Used for `PAYLOAD_SECRET` and `DATABASE_URI` so a misconfigured deployment
 * fails immediately at startup instead of at the first request.
 */
export const requireEnv = (name: string): string => {
  const value = (process.env[name] ?? '').trim()

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. ` +
        `Set it in the environment (see .env.example) before starting the application.`,
    )
  }

  return value
}
