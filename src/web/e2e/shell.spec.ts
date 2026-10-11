import { expect, test } from '@playwright/test'
import { MockBackend } from './mockBackend.ts'
import { mockHealth, shellHeader, text } from './support.ts'

// Signed out throughout: the app's first page is then the sign-in page.
test.beforeEach(async ({ context }) => {
  await new MockBackend().attach(context)
})

test('renders the shell and the sign-in page when the server is awake', async ({
  page,
  context,
}) => {
  const health = await mockHealth(context, 'ok')
  await page.goto('/')

  await expect(shellHeader(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: text.signInTitle })).toBeVisible()
  await expect(page.getByText(text.wakingTitle)).toHaveCount(0)
  await expect(page).toHaveTitle(text.appName)
  expect(health.calls).toEqual(['ok'])
})

test('shows a German not-found page for unknown addresses', async ({ page, context }) => {
  await mockHealth(context, 'ok')
  await page.goto('/gibt-es-nicht')

  await expect(shellHeader(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: text.notFoundTitle })).toBeVisible()
  await page.getByRole('link', { name: 'Zur Startseite' }).click()
  await expect(page.getByRole('heading', { name: text.signInTitle })).toBeVisible()
})

test('shows the waking screen while the server answers 503, then the app', async ({
  page,
  context,
}) => {
  const health = await mockHealth(context, 'waking')
  await page.goto('/')

  await expect(shellHeader(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: text.wakingTitle })).toBeVisible()
  await expect(page.getByRole('heading', { name: text.signInTitle })).toHaveCount(0)

  health.set('ok')
  await expect(page.getByRole('heading', { name: text.signInTitle })).toBeVisible()
  await expect(page.getByText(text.wakingTitle)).toHaveCount(0)

  // Once awake, the app stops asking.
  const calls = health.calls.length
  await page.waitForTimeout(3_000)
  expect(health.calls).toHaveLength(calls)
})

test("offers installing when the browser does, and opens the browser's dialog", async ({
  page,
  context,
}) => {
  await mockHealth(context, 'ok')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: text.signInTitle })).toBeVisible()

  // Headless Chromium doesn't offer installing by itself, so fire its event with
  // a fake dialog that records the call.
  await page.evaluate(() => {
    const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
      prompt: async () => {
        document.body.dataset.installPrompted = 'yes'
      },
      userChoice: Promise.resolve({ outcome: 'accepted' }),
    })
    window.dispatchEvent(event)
  })

  const install = page.getByRole('banner').getByRole('button', { name: text.installButton })
  await install.click()
  await expect(page.locator('body')).toHaveAttribute('data-install-prompted', 'yes')
  await expect(install).toHaveCount(0)
})

test('serves a valid web app manifest', async ({ request }) => {
  const response = await request.get('/manifest.webmanifest')
  expect(response.ok()).toBe(true)
  const manifest = await response.json()
  expect(manifest).toMatchObject({
    name: "Oreana's Office",
    short_name: 'Oreana',
    lang: 'de',
    display: 'standalone',
  })
  const purposes = manifest.icons.map((icon: { purpose?: string }) => icon.purpose)
  expect(purposes).toContain('maskable')
})
