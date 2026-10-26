// Stage 7 on a laptop: the DM confirms a background job in the editor, the map is synced
// first, the editor follows the job over the image hub, picks the finished picture, and the
// preview draws it under the grid.
import { expect, test, type Page } from '@playwright/test'
import { MockBackend } from './mockBackend.ts'
import { MockImageHub } from './mockHub.ts'

// Text the spec looks for; mirrors src/text/de.ts (maps.background).
const text = {
  tool: 'Hintergrund',
  notSynced:
    'Diese Karte ist noch nicht auf dem Server. Beim Erzeugen wird sie zuerst synchronisiert.',
  generate: 'Hintergrund erzeugen',
  regenerate: 'Neu erzeugen',
  confirmTitle: 'Hintergrund erzeugen?',
  confirm: 'Erzeugen',
  queued: 'Der Auftrag ist angenommen. Das Bild ist in etwa einer halben Minute fertig.',
  inQueue: 'In der Warteschlange',
  pick: 'Auswählen',
  picked: 'Ausgewählt',
  spent: 'Diesen Monat: 0,47 $ von 20,00 $',
  offline:
    'Hintergründe brauchen eine Verbindung: zum Erzeugen, Hochladen, für die Versionen und zum Auswählen.',
}

const CAMPAIGN = 'Die Rabenküste'

let backend: MockBackend
let images: MockImageHub

test.skip(({ isMobile }) => isMobile, 'The editor is for laptops')

test.beforeEach(async ({ context }) => {
  backend = new MockBackend()
  images = new MockImageHub(backend)
  const jennie = backend.addUser({ displayName: 'Jennie', email: 'jennie@example.org' })
  backend.addCampaign(CAMPAIGN, jennie)
  backend.signIn(context, jennie)
  await backend.attach(context)
  await images.attach(context)
})

async function newMap(page: Page, name: string) {
  await page.goto('/')
  await page.getByRole('link', { name: new RegExp(CAMPAIGN) }).click()
  await page.getByRole('link', { name: /^Karten/ }).click()
  const form = page.getByRole('region', { name: 'Neue Karte' })
  await form.getByLabel('Name').fill(name)
  await form.getByLabel('Breite').fill('10')
  await form.getByLabel('Höhe').fill('6')
  await form.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByRole('textbox', { name: 'Name der Karte' })).toHaveValue(name)
}

test('a DM generates a background after confirming, picks it, and the preview shows it', async ({
  page,
}) => {
  await newMap(page, 'Klamm')
  await page
    .getByRole('navigation', { name: 'Werkzeuge' })
    .getByRole('button', { name: text.tool, exact: true })
    .click()
  await expect(page.getByText(text.notSynced)).toBeVisible()

  // Nothing happens before the confirm.
  await page.getByRole('button', { name: text.generate }).click()
  const dialog = page.getByRole('dialog', { name: text.confirmTitle })
  await expect(dialog).toBeVisible()
  expect(backend.backgrounds).toHaveLength(0)
  await dialog.getByRole('button', { name: text.confirm, exact: true }).click()

  // The map was synced first, then the job queued; the editor watches it.
  await expect(page.getByText(text.queued)).toBeVisible()
  await expect(page.getByText(text.inQueue).first()).toBeVisible()
  expect(backend.backgrounds).toHaveLength(1)
  await expect.poll(() => images.watching(backend.backgrounds[0]!.mapId)).toBe(1)

  // The worker finishes it: the gallery shows the picture and the editor lets go of the hub.
  images.backgroundUpdated(backend.finishBackground(backend.backgrounds[0]!.id))
  const version = page.getByRole('listitem')
  await expect(version.getByRole('img')).toBeVisible()
  await expect.poll(() => images.open).toBe(0)
  await expect(page.getByText(text.spent)).toBeVisible()

  await version.getByRole('button', { name: text.pick }).click()
  await expect(version.getByText(text.picked)).toBeVisible()
  expect(backend.pickedBackgrounds.get(backend.backgrounds[0]!.mapId)).toBe(
    backend.backgrounds[0]!.id,
  )
  await expect(page.getByRole('button', { name: text.regenerate })).toBeEnabled()

  // The preview draws the picture under the grid.
  await page.getByRole('button', { name: 'Vorschau' }).click()
  await expect(page.getByTestId('board')).toHaveAttribute('data-background', 'shown')
})

test('offline, the panel says backgrounds need a connection', async ({ page, context }) => {
  await newMap(page, 'Klamm')
  await context.setOffline(true)
  await page
    .getByRole('navigation', { name: 'Werkzeuge' })
    .getByRole('button', { name: text.tool, exact: true })
    .click()
  await expect(page.getByText(text.offline)).toBeVisible()
  await expect(page.getByRole('button', { name: text.generate })).toHaveCount(0)
})
