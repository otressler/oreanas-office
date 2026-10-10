import { expect, test } from '@playwright/test'
import { mockHealth, shellHeader, text, waitForServiceWorker } from './support.ts'

test('shows the cached shell after an offline reload', async ({ page, context }) => {
  await mockHealth(context, 'ok')
  await page.goto('/')
  await expect(page.getByRole('heading', { name: text.homeTitle })).toBeVisible()
  await waitForServiceWorker(page)

  await context.setOffline(true)
  await page.reload()

  await expect(shellHeader(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: text.offlineTitle })).toBeVisible()

  // Back online, the app finds the server again without another reload.
  await context.setOffline(false)
  await expect(page.getByRole('heading', { name: text.homeTitle })).toBeVisible()
})
