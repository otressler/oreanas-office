// Stage 10's fog in the map editor's encounter mode (knowledge/features/fog-of-war.md,
// "Preparing"), on a laptop and offline like the rest of encounter prep: a DM turns fog on,
// reveals the starting corner, makes the area "Nordkammer", places a hidden goblin, sees
// everything after a reload without a connection, and syncs it up when the connection is back.
import { expect, test, type Page } from '@playwright/test'
import { MockBackend } from './mockBackend.ts'
import { cellCentre, text, waitForServiceWorker } from './support.ts'

const CAMPAIGN = 'Die Rabenküste'
const EDITOR = '[data-editor-surface]'

test.skip(({ isMobile }) => isMobile, 'The editor is for laptops')

let backend: MockBackend

test.beforeEach(async ({ context }) => {
  backend = new MockBackend()
  const jennie = backend.addUser({ displayName: 'Jennie', email: 'jennie@example.org' })
  const campaign = backend.addCampaign(CAMPAIGN, jennie)
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

const saved = (page: Page) => expect(page.getByText('Auf diesem Gerät gespeichert')).toBeVisible()
/** "51 von 60 Feldern verdeckt" in the Nebel panel. */
const counts = (page: Page, hidden: number, total: number) =>
  page.getByText(`${hidden} von ${total} Feldern verdeckt`)
const hiddenSwitch = (page: Page) => page.getByRole('switch', { name: 'Verborgen', exact: true })

test('a DM prepares fog, an area and a hidden goblin offline, and it syncs later', async ({
  page,
  context,
}) => {
  await page.goto('/')
  await page.getByRole('link', { name: new RegExp(CAMPAIGN) }).click()
  await page.getByRole('link', { name: text.campaignMaps }).click()
  const form = page.getByRole('region', { name: text.newMapTitle })
  await form.getByLabel(text.mapName).fill('Krypta')
  await form.getByLabel('Breite').fill('10')
  await form.getByLabel('Höhe').fill('6')
  await form.getByRole('button', { name: text.createMap }).click()
  await expect(page.getByRole('heading', { name: 'Krypta' })).toBeVisible()

  await waitForServiceWorker(page)
  await context.setOffline(true)

  await tool(page, 'Rechteck').click()
  await page.getByRole('button', { name: /^Boden/ }).click()
  await dragCells(page, [0, 0], [9, 5])
  await saved(page)

  await page.getByRole('button', { name: /^Begegnungen/ }).click()
  await page
    .getByRole('dialog', { name: 'Begegnungen' })
    .getByRole('button', { name: 'Neue Begegnung' })
    .click()
  await expect(page.getByLabel('Name der Begegnung')).toHaveValue('Krypta')
  await page.getByRole('button', { name: 'Neue Kreaturenart' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Goblin')
  await page.getByLabel('Größe').selectOption({ label: 'Klein (1 × 1 Felder)' })
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByRole('button', { name: 'Goblin wählen' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )

  // Fog on: the whole map is hidden. The DM sees it hatched, the map stays readable.
  await tool(page, 'Nebel').click()
  await page.getByRole('button', { name: 'Nebel einschalten' }).click()
  await counts(page, 60, 60).waitFor()

  // Reveal the starting corner with the rectangle.
  await page.getByRole('button', { name: 'Rechteck', exact: true }).click()
  await dragCells(page, [0, 0], [2, 2])
  await counts(page, 51, 60).waitFor()

  // The area: choose cells with the rectangle, name it, make it.
  await page.getByRole('switch', { name: 'Felder wählen' }).check()
  await dragCells(page, [6, 1], [8, 3])
  await expect(page.getByText('9 Felder gewählt')).toBeVisible()
  await page.getByLabel('Name des Bereichs').fill('Nordkammer')
  await page.getByRole('button', { name: 'Bereich anlegen' }).click()
  await page.getByRole('button', { name: 'Nordkammer auf der Karte zeigen' }).click()
  await expect(
    page.getByRole('button', { name: 'Nordkammer auf der Karte zeigen' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: `test-results/fog/editor-fog-${test.info().project.name}.png` })
  await page.getByRole('switch', { name: 'Felder wählen' }).uncheck()

  // A goblin placed hidden in the Nordkammer, and a visible one in the open corner.
  await tool(page, 'Platzieren').click()
  await page.getByRole('switch', { name: 'Verborgen platzieren' }).check()
  await clickCell(page, 7, 2)
  await page.getByRole('switch', { name: 'Verborgen platzieren' }).uncheck()
  await clickCell(page, 1, 1)
  await expect(page.getByText('2 Kreaturen')).toBeVisible()
  await saved(page)

  await tool(page, 'Auswählen').click()
  await clickCell(page, 7, 2)
  await expect(hiddenSwitch(page)).toBeChecked()
  await page.screenshot({ path: `test-results/fog/editor-hidden-${test.info().project.name}.png` })
  await clickCell(page, 1, 1)
  await expect(hiddenSwitch(page)).not.toBeChecked()
  // The switch hides a creature that was placed visible, and shows it again.
  await hiddenSwitch(page).check()
  await hiddenSwitch(page).uncheck()
  await saved(page)

  // Closed and opened again without a connection: fog, area and the hidden goblin remain.
  const encounterUrl = page.url()
  await page.reload()
  await expect(page).toHaveURL(encounterUrl)
  await tool(page, 'Nebel').click()
  await counts(page, 51, 60).waitFor()
  await expect(page.getByRole('button', { name: 'Nordkammer auf der Karte zeigen' })).toBeVisible()
  await tool(page, 'Auswählen').click()
  await clickCell(page, 7, 2)
  await expect(hiddenSwitch(page)).toBeChecked()

  // Back online, the sync carries fog, the area and the hidden flag up to the server.
  await context.setOffline(false)
  const sync = page.getByRole('button', { name: 'Sync', exact: true })
  await expect(sync).toBeEnabled()
  await sync.click()
  await expect
    .poll(() => {
      const item = [...backend.syncItems.values()].find((i) => i.kind === 'encounter')
      return item?.encounter?.fog?.hiddenCells.length
    })
    .toBe(51)
  const item = [...backend.syncItems.values()].find((i) => i.kind === 'encounter')!
  expect(item.encounter!.fog!.areas).toMatchObject([{ name: 'Nordkammer' }])
  expect(item.encounter!.tokens.map((token) => token.hidden)).toEqual([true, false])
})
