import { expect, test } from '@playwright/test'
import { mockHealth, shellHeader, text } from './support.ts'

test('renders the shell and the home page when the server is awake', async ({ page, context }) => {
  const health = await mockHealth(context, 'ok')
  await page.goto('/')

  await expect(shellHeader(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: text.homeTitle })).toBeVisible()
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
  await expect(page.getByRole('heading', { name: text.homeTitle })).toBeVisible()
})

test('shows the waking screen while the server answers 503, then the app', async ({
  page,
  context,
}) => {
  const health = await mockHealth(context, 'waking')
  await page.goto('/')

  await expect(shellHeader(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: text.wakingTitle })).toBeVisible()
  await expect(page.getByRole('heading', { name: text.homeTitle })).toHaveCount(0)

  health.set('ok')
  await expect(page.getByRole('heading', { name: text.homeTitle })).toBeVisible()
  await expect(page.getByText(text.wakingTitle)).toHaveCount(0)

  // Once awake, the app stops asking.
  const calls = health.calls.length
  await page.waitForTimeout(3_000)
  expect(health.calls).toHaveLength(calls)
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
