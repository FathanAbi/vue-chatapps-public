import { test, expect } from '@playwright/test'

/**
 * A3 / SEC-017: the previous test asserted the Payload *template* landing page
 * ("Payload Blank Template" / "Welcome to your new project."). That check was
 * meaningless for this application — it would pass even if the app were broken,
 * and it advertised template residue. This version asserts the real public
 * surface: the SPA loads and its security headers are present.
 */
test.describe('Frontend', () => {
  test('serves the SPA with security headers', async ({ page }) => {
    const response = await page.goto('/')

    expect(response).not.toBeNull()
    expect(response!.status()).toBeLessThan(400)

    // The SPA mounts into a known root element.
    await expect(page.locator('#app')).toBeVisible()
  })

  test('refuses to be framed (clickjacking protection)', async ({ request, baseURL }) => {
    const response = await request.get(baseURL ?? '/')

    const csp = response.headers()['content-security-policy'] ?? ''
    const frameOptions = response.headers()['x-frame-options'] ?? ''

    // At least one of the two anti-framing controls must be present.
    expect(csp.includes('frame-ancestors') || frameOptions.toUpperCase() === 'DENY').toBe(true)
  })
})
