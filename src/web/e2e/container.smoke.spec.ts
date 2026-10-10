// Smoke test against a real deployment, e.g. the Docker container:
//   E2E_BASE_URL=http://localhost:8080 npm run test:e2e
// Nothing is mocked. Skipped when E2E_BASE_URL isn't set.
import { expect, test } from '@playwright/test'
import { shellHeader, text, waitForServiceWorker } from './support.ts'

test.skip(!process.env.E2E_BASE_URL, 'E2E_BASE_URL is not set')

// A cold database can take up to about a minute to resume.
const WAKE_TIMEOUT = 90_000
test.setTimeout(WAKE_TIMEOUT + 30_000)

test('health answers ok', async ({ request }) => {
  await expect
    .poll(async () => (await request.get('/api/health')).status(), { timeout: WAKE_TIMEOUT })
    .toBe(200)
  const response = await request.get('/api/health')
  expect(await response.json()).toMatchObject({ status: 'ok' })
})

test('the shell loads and the app wakes up', async ({ page }) => {
  await page.goto('/')
  await expect(shellHeader(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: text.homeTitle })).toBeVisible({
    timeout: WAKE_TIMEOUT,
  })
})

test('an offline reload still shows the shell', async ({ page, context }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: text.homeTitle })).toBeVisible({
    timeout: WAKE_TIMEOUT,
  })
  await waitForServiceWorker(page)

  await context.setOffline(true)
  await page.reload()

  await expect(shellHeader(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: text.offlineTitle })).toBeVisible()
})
