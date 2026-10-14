// The stage 5 gate on a laptop: build a map with the editor's tools while offline,
// close and reopen it offline, and try a test token in the preview.
import { expect, test, type Page } from '@playwright/test'
import { MockBackend } from './mockBackend.ts'
import { cellCentre, tapCell, text, waitForServiceWorker } from './support.ts'

const CAMPAIGN = 'Die Rabenküste'
const EDITOR = '[data-editor-surface]'

test.skip(({ isMobile }) => isMobile, 'The editor is for laptops')

test.beforeEach(async ({ context }) => {
  const backend = new MockBackend()
  const jennie = backend.addUser({ displayName: 'Jennie', email: 'jennie@example.org' })
  backend.addCampaign(CAMPAIGN, jennie)
  backend.signIn(context, jennie)
  await backend.attach(context)
})

/** Drags the primary mouse button from one cell of the editor to another. */
async function dragCells(page: Page, from: [number, number], to: [number, number]) {
  const start = await cellCentre(page, from[0], from[1], EDITOR)
  const end = await cellCentre(page, to[0], to[1], EDITOR)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 8 })
  await page.mouse.up()
}

const tool = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Werkzeuge' }).getByRole('button', { name, exact: true })

const checks = (page: Page) => page.getByText(/^Keine Probleme$|^\d+ Probleme?$/)

test('a DM builds a gorge crossing offline, and it is still there after a reload', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: new RegExp(CAMPAIGN) }).click()
  await page.getByRole('link', { name: text.campaignMaps }).click()
  const form = page.getByRole('region', { name: text.newMapTitle })
  await form.getByLabel(text.mapName).fill('Klamm')
  await form.getByLabel('Breite').fill('10')
  await form.getByLabel('Höhe').fill('6')
  await form.getByRole('button', { name: text.createMap }).click()
  await expect(page.getByRole('heading', { name: 'Klamm' })).toBeVisible()
  const mapUrl = page.url()

  await waitForServiceWorker(page)
  await context.setOffline(true)

  // Floor everywhere, a gorge through the middle, a wall on the right.
  await tool(page, 'Rechteck').click()
  await page.getByRole('button', { name: /^Boden/ }).click()
  await dragCells(page, [0, 0], [9, 5])
  await page.getByRole('button', { name: /^Leer/ }).click()
  await dragCells(page, [4, 0], [5, 5])
  await page.getByRole('button', { name: /^Wand/ }).click()
  await dragCells(page, [9, 0], [9, 5])

  // A bridge over the gorge (the feature tool starts as a bridge that doesn't block).
  await tool(page, 'Objekt').click()
  await expect(page.getByRole('textbox', { name: 'Art', exact: true })).toHaveValue('Brücke')
  await expect(page.getByRole('button', { name: 'Brücke', pressed: true })).toBeVisible()
  await dragCells(page, [4, 2], [5, 2])

  // An entrance on the left edge.
  await tool(page, 'Ein- und Ausgang').click()
  await dragCells(page, [0, 2], [0, 3])

  await expect(checks(page)).toHaveText('Keine Probleme')
  await expect(page.getByText('Auf diesem Gerät gespeichert')).toBeVisible()

  // Undo takes the entrance away, redo brings it back.
  await page.keyboard.press('Control+z')
  await page.keyboard.press('Control+Shift+z')
  await expect(page.getByRole('button', { name: 'Wiederholen' })).toBeDisabled()

  // Closed and opened again without a connection: everything is still there.
  await page.reload()
  await expect(page).toHaveURL(mapUrl)
  await expect(page.getByRole('heading', { name: 'Klamm' })).toBeVisible()
  await expect(checks(page)).toHaveText('Keine Probleme')

  // The preview: the test token stands on the bridge, not in the gorge or on the wall.
  await page.getByRole('button', { name: 'Vorschau' }).click()
  await expect(page.locator('[data-board-surface]')).toBeVisible()
  await tapCell(page, 4, 2)
  await expect(page.getByText(/Die Testfigur steht auf 4, 2/)).toBeVisible()
  await tapCell(page, 4, 0)
  await expect(page.getByText('Dort kann die Testfigur nicht stehen.')).toBeVisible()
  await tapCell(page, 9, 1)
  await expect(page.getByText('Dort kann die Testfigur nicht stehen.')).toBeVisible()
  await tapCell(page, 1, 1)
  await expect(page.getByText(/Die Testfigur steht auf 1, 1/)).toBeVisible()
})
