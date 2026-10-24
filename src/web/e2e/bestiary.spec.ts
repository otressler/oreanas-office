// The stage 6 gate for bestiary and placement on a laptop, offline: a DM makes an
// encounter on a map, creates a creature type while placing, places and removes goblins
// (the numbers are not reused), marks the encounter ready, and sees it flagged once the
// map changes under a goblin. Everything survives a reload.
import { expect, test, type Page } from '@playwright/test'
import { MockBackend } from './mockBackend.ts'
import { cellCentre, text, waitForServiceWorker } from './support.ts'

const CAMPAIGN = 'Die Rabenküste'
const EDITOR = '[data-editor-surface]'

test.skip(({ isMobile }) => isMobile, 'The editor is for laptops')

test.beforeEach(async ({ context }) => {
  const backend = new MockBackend()
  const jennie = backend.addUser({ displayName: 'Jennie', email: 'jennie@example.org' })
  const campaign = backend.addCampaign(CAMPAIGN, jennie)
  // Fights belong to a session; the editor offers the planned ones Jennie runs.
  backend.addSession(campaign, jennie, 'planned')
  backend.signIn(context, jennie)
  await backend.attach(context)
})

const tool = (page: Page, name: string) =>
  page.getByRole('navigation', { name: 'Werkzeuge' }).getByRole('button', { name, exact: true })

async function clickCell(page: Page, x: number, y: number) {
  const point = await cellCentre(page, x, y, EDITOR)
  await page.mouse.click(point.x, point.y)
}

async function dragCells(page: Page, from: [number, number], to: [number, number]) {
  const start = await cellCentre(page, from[0], from[1], EDITOR)
  const end = await cellCentre(page, to[0], to[1], EDITOR)
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(end.x, end.y, { steps: 6 })
  await page.mouse.up()
}

const ready = (page: Page) => page.getByRole('switch', { name: 'Bereit' })
/** "Bereit" and starting are the panel of the toolbar's "Begegnung" entry. */
const encounterPanel = (page: Page) => tool(page, 'Begegnung').click()
/** Map mode's "Begegnungen" menu in the header, opened. */
async function openEncounterMenu(page: Page) {
  await page.getByRole('button', { name: /^Begegnungen/ }).click()
  return page.getByRole('dialog', { name: 'Begegnungen' })
}
const label = (page: Page) => page.getByLabel('Bezeichnung')

/** Selects the token on a cell and reads its label. */
async function labelAt(page: Page, x: number, y: number) {
  await tool(page, 'Auswählen').click()
  await clickCell(page, x, y)
  return label(page).inputValue()
}

test('a DM prepares an encounter with goblins offline, and it survives a reload', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: new RegExp(CAMPAIGN) }).click()
  await page.getByRole('link', { name: text.campaignMaps }).click()
  const form = page.getByRole('region', { name: text.newMapTitle })
  await form.getByLabel(text.mapName).fill('Hinterhalt')
  await form.getByLabel('Breite').fill('10')
  await form.getByLabel('Höhe').fill('6')
  await form.getByRole('button', { name: text.createMap }).click()
  await expect(page.getByRole('heading', { name: 'Hinterhalt' })).toBeVisible()
  const mapUrl = page.url()

  await waitForServiceWorker(page)
  await context.setOffline(true)

  // A floor everywhere.
  await tool(page, 'Rechteck').click()
  await page.getByRole('button', { name: /^Boden/ }).click()
  await dragCells(page, [0, 0], [9, 5])
  await expect(page.getByText('Auf diesem Gerät gespeichert')).toBeVisible()

  // A new encounter opens in encounter mode, named after the map.
  await (await openEncounterMenu(page)).getByRole('button', { name: 'Neue Begegnung' }).click()
  const name = page.getByLabel('Name der Begegnung')
  await expect(name).toHaveValue('Hinterhalt')
  await expect(page.getByRole('heading', { name: 'Karte: Hinterhalt' })).toBeVisible()
  // Platzieren, Auswählen, Nebel and Begegnung.
  await expect(page.getByRole('navigation', { name: 'Werkzeuge' }).getByRole('button')).toHaveCount(
    4,
  )
  await expect(page.getByText('0 Kreaturen')).toBeVisible()

  // A creature type, made while placing; it becomes the picked one.
  await page.getByRole('button', { name: 'Neue Kreaturenart' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Goblin')
  await page.getByLabel('Größe').selectOption({ label: 'Klein (1 × 1 Felder)' })
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByRole('button', { name: 'Goblin wählen' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Three goblins, then the second one goes and the next one is Goblin 4.
  await clickCell(page, 1, 1)
  await clickCell(page, 3, 1)
  await clickCell(page, 5, 1)
  await expect(page.getByText('3 Kreaturen')).toBeVisible()
  // A click on a taken cell places nothing.
  await clickCell(page, 3, 1)
  await expect(page.getByText('3 Kreaturen')).toBeVisible()

  expect(await labelAt(page, 3, 1)).toBe('Goblin 2')
  await page.keyboard.press('Delete')
  await expect(page.getByText('2 Kreaturen')).toBeVisible()

  await tool(page, 'Platzieren').click()
  await clickCell(page, 7, 1)
  await expect(page.getByText('3 Kreaturen')).toBeVisible()
  expect(await labelAt(page, 7, 1)).toBe('Goblin 4')
  expect(await labelAt(page, 5, 1)).toBe('Goblin 3')

  // A goblin can be renamed.
  await label(page).fill('Grisk')
  await label(page).blur()
  await expect(page.getByText('Auf diesem Gerät gespeichert')).toBeVisible()

  // Ready by hand.
  await encounterPanel(page)
  await expect(ready(page)).not.toBeChecked()
  await ready(page).check()
  await expect(ready(page)).toBeChecked()
  await expect(page.getByText('Auf diesem Gerät gespeichert')).toBeVisible()
  const encounterUrl = page.url()

  // Closed and opened again offline: everything is still there.
  await page.reload()
  await expect(page).toHaveURL(encounterUrl)
  await expect(page.getByLabel('Name der Begegnung')).toHaveValue('Hinterhalt')
  await encounterPanel(page)
  await expect(ready(page)).toBeChecked()
  await expect(page.getByText('3 Kreaturen')).toBeVisible()
  expect(await labelAt(page, 7, 1)).toBe('Goblin 4')
  expect(await labelAt(page, 5, 1)).toBe('Grisk')
  expect(await labelAt(page, 1, 1)).toBe('Goblin 1')
  // Starting needs the server.
  await encounterPanel(page)
  await expect(page.getByText('Zum Starten brauchst du eine Verbindung zum Server.')).toBeVisible()

  // The map changes under a goblin: a wall on its cell.
  await page.getByRole('link', { name: /Zur Karte/ }).click()
  await expect(page).toHaveURL(mapUrl)
  await expect(page.getByRole('button', { name: 'Begegnungen (1)' })).toBeVisible()
  await tool(page, 'Pinsel').click()
  await page.getByRole('button', { name: /^Wand/ }).click()
  await clickCell(page, 1, 1)
  await expect(page.getByText('Auf diesem Gerät gespeichert')).toBeVisible()
  // The menu's button and the list flag the encounter, which stays ready.
  await expect(
    page.getByRole('button', { name: /^Begegnungen \(1\)\. .*nicht mehr gültig/ }),
  ).toBeVisible()
  const menu = await openEncounterMenu(page)
  await expect(menu.getByRole('img', { name: /nicht mehr gültig/ })).toBeVisible()

  await menu.getByRole('link', { name: 'Hinterhalt' }).click()
  await encounterPanel(page)
  await expect(ready(page)).toBeChecked()
  await expect(page.getByRole('alert')).toContainText('Goblin 1')

  // Back to a draft, and it can't be marked ready again until the goblin is moved.
  await ready(page).uncheck()
  await expect(ready(page)).toBeDisabled()
  await expect(page.getByText(/Nicht gültig: Goblin 1/)).toBeVisible()

  await tool(page, 'Auswählen').click()
  await dragCells(page, [1, 1], [1, 3])
  await encounterPanel(page)
  await expect(ready(page)).toBeEnabled()
  await ready(page).check()
  await expect(ready(page)).toBeChecked()
})
