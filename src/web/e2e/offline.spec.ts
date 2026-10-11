import { expect, test } from '@playwright/test'
import { MockBackend } from './mockBackend.ts'
import { shellHeader, text, waitForServiceWorker } from './support.ts'

test('shows the cached shell after an offline reload', async ({ page, context }) => {
  const backend = new MockBackend()
  backend.signIn(context, backend.addUser({ displayName: 'Mira', email: 'mira@example.org' }))
  await backend.attach(context)
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
