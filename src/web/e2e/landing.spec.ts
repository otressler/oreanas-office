import { expect, test } from '@playwright/test'
import { MockBackend } from './mockBackend.ts'
import { mockHealth, text } from './support.ts'

// A device nobody has signed in on yet: home is the landing page.
test.beforeEach(async ({ context }) => {
  await new MockBackend().attach(context, { newDevice: true })
})

test('shows the landing page at home without waking the server', async ({ page, context }) => {
  const health = await mockHealth(context, 'waking')
  await page.goto('/')

  await expect(page).toHaveURL('/willkommen')
  await expect(page.getByRole('heading', { level: 1, name: text.appName })).toBeVisible()
  await expect(page.getByText(text.wakingTitle)).toHaveCount(0)
  await page.getByRole('heading', { name: 'Die Runde wartet!' }).scrollIntoViewIfNeeded()
  expect(health.calls).toEqual([])
})

test('signing in wakes the server', async ({ page, context }) => {
  const health = await mockHealth(context, 'ok')
  await page.goto('/willkommen')

  await page.getByRole('banner').getByRole('link', { name: 'Anmelden' }).click()
  await expect(page.getByRole('heading', { name: text.signInTitle })).toBeVisible()
  expect(health.calls).toEqual(['ok'])
})

test('fits a phone without scrolling sideways', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await page.goto('/willkommen')
  await expect(page.getByRole('heading', { level: 1, name: text.appName })).toBeVisible()

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(overflow).toBe(0)
})

test('compares the drawn and the painted map by dragging', async ({ page }) => {
  await page.goto('/willkommen')
  const slider = page.getByRole('slider', {
    name: 'Vergleich zwischen gezeichneter und gemalter Karte',
  })
  const area = page.locator('#karte .cursor-ew-resize')
  await area.scrollIntoViewIfNeeded()
  const box = (await area.boundingBox())!

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 4, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(slider).toHaveValue('25')
})
