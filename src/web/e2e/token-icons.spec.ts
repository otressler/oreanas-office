// Stage 8: token icons and portraits. A DM generates a creature icon from the editor's
// bestiary after confirming it, or uploads one through the crop step; a player uploads a portrait through the crop step and sees
// it in the characters panel; a board with an image token draws without errors.
import { fileURLToPath } from 'node:url'
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { MockBackend, sampleMap } from './mockBackend.ts'
import { MockHub, MockImageHub } from './mockHub.ts'

// Text the spec looks for; mirrors src/text/de.ts (bestiary.icon, characters, tokenImages).
const text = {
  syncNow: 'Jetzt synchronisieren',
  generateIcon: 'Symbol erzeugen',
  confirmIconTitle: 'Symbol erzeugen?',
  confirm: 'Erzeugen',
  picked: 'Ausgewählt',
  iconAlt: 'Symbol: Goblin',
  pickedIconAlt: 'Ausgewähltes Bild: Goblin',
  upload: 'Bild hochladen',
  cropTitle: 'Bildausschnitt wählen',
  cropOk: 'Hochladen',
  restyle: 'Im Token-Stil umwandeln',
  uploaded: 'Das Bild ist hochgeladen und ausgewählt.',
  portraitAlt: 'Porträt: Brom',
}

const CAMPAIGN = 'Die Rabenküste'
const PICTURE = fileURLToPath(new URL('../public/pwa-512x512.png', import.meta.url))

let backend: MockBackend
let images: MockImageHub

test.beforeEach(async ({ context }) => {
  backend = new MockBackend()
  images = new MockImageHub(backend)
  await backend.attach(context)
  await images.attach(context)
})

/** Collects page errors and console errors, failed image loads aside from none. */
function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

/** Creates a map and the creature type Goblin in the editor, and opens its icon section. */
async function openGoblinIcon(page: Page, context: BrowserContext) {
  const jennie = backend.addUser({ displayName: 'Jennie', email: 'jennie@example.org' })
  const campaign = backend.addCampaign(CAMPAIGN, jennie)
  backend.addSession(campaign, jennie, 'planned')
  backend.signIn(context, jennie)

  await page.goto('/')
  await page.getByRole('link', { name: new RegExp(CAMPAIGN) }).click()
  await page.getByRole('link', { name: /^Karten/ }).click()
  const form = page.getByRole('region', { name: 'Neue Karte' })
  await form.getByLabel('Name').fill('Hinterhalt')
  await form.getByLabel('Breite').fill('8')
  await form.getByLabel('Höhe').fill('6')
  await form.getByRole('button', { name: 'Anlegen' }).click()
  await expect(page.getByRole('heading', { name: 'Hinterhalt' })).toBeVisible()

  await page.getByRole('button', { name: /^Begegnungen/ }).click()
  await page
    .getByRole('dialog', { name: 'Begegnungen' })
    .getByRole('button', { name: 'Neue Begegnung' })
    .click()
  await page.getByRole('button', { name: 'Neue Kreaturenart' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Goblin')
  await page.getByLabel('Aussehen').fill('Kleiner grüner Kobold mit Krummsäbel')
  await page.getByRole('button', { name: 'Anlegen' }).click()
  await page.getByRole('button', { name: 'Goblin bearbeiten' }).click()

  // A type only on this device syncs first; the editor may have synced it already.
  const icon = page.getByRole('region', { name: 'Symbol' })
  const generate = icon.getByRole('button', { name: text.generateIcon })
  const syncNow = icon.getByRole('button', { name: text.syncNow })
  await expect(generate.or(syncNow)).toBeVisible()
  // The editor's own sync can win the race and replace the button while it is clicked.
  if (await syncNow.isVisible()) await syncNow.click({ timeout: 3000 }).catch(() => {})
  await expect(generate).toBeEnabled()
  return { icon, generate }
}

test('a DM generates a creature icon in the editor after confirming, and it is picked', async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(isMobile, 'The editor is for laptops')
  const { icon, generate } = await openGoblinIcon(page, context)

  // Nothing happens before the confirm.
  await generate.click()
  const dialog = page.getByRole('dialog', { name: text.confirmIconTitle })
  await expect(dialog).toContainText('Diesen Monat: 0,42 $ von 20,00 $')
  expect(backend.tokenImages).toHaveLength(0)
  await dialog.getByRole('button', { name: text.confirm, exact: true }).click()

  // Queued, followed over the hub, done and picked.
  await expect.poll(() => backend.tokenImages.length).toBe(1)
  const version = icon.getByRole('listitem')
  await expect(version.getByText(text.picked)).toBeVisible()
  await expect(icon.getByRole('img', { name: text.pickedIconAlt })).toBeVisible()
  await expect.poll(() => images.open).toBe(0)
  const typeId = backend.tokenImages[0]!.image.ownerId
  expect(backend.pickedTokenImages.get(typeId)).toBe(backend.tokenImages[0]!.image.id)

  // The bestiary's row shows the icon too.
  await page.getByRole('button', { name: 'Abbrechen' }).first().click()
  await expect(page.getByRole('img', { name: text.iconAlt })).toBeVisible()
})

test('a DM uploads a creature icon through the crop step, and it is picked', async ({
  page,
  context,
  isMobile,
}) => {
  test.skip(isMobile, 'The editor is for laptops')
  const errors = watchErrors(page)
  const { icon } = await openGoblinIcon(page, context)

  await icon.getByTestId('portrait-file').setInputFiles(PICTURE)
  const crop = page.getByRole('dialog', { name: text.cropTitle })
  await expect(crop.getByTestId('crop-box').getByRole('img')).toBeVisible()
  await crop.getByRole('button', { name: text.cropOk }).click()

  await expect(crop).toBeHidden()
  await expect(icon.getByText(text.uploaded)).toBeVisible()
  expect(backend.tokenImages).toHaveLength(1)
  const uploaded = backend.tokenImages[0]!
  expect(uploaded).toMatchObject({
    contentType: 'image/jpeg',
    image: { ownerType: 'creatureType', origin: 'uploaded', status: 'done' },
  })
  expect(backend.pickedTokenImages.get(uploaded.image.ownerId)).toBe(uploaded.image.id)
  // Creature icons can't be restyled.
  await expect(icon.getByRole('button', { name: text.restyle })).toHaveCount(0)

  await page.getByRole('button', { name: 'Abbrechen' }).first().click()
  await expect(page.getByRole('img', { name: text.iconAlt })).toBeVisible()
  expect(errors).toEqual([])
})

test('a player uploads a portrait through the crop step and sees it in the list', async ({
  page,
  context,
}) => {
  const errors = watchErrors(page)
  const dm = backend.addUser({ displayName: 'Oreana', email: 'oreana@example.org' })
  const mira = backend.addUser({ displayName: 'Mira', email: 'mira@example.org' })
  const campaign = backend.addCampaign(CAMPAIGN, dm)
  backend.addMember(campaign, mira)
  backend.addCharacter(campaign, mira, 'Brom')
  backend.signIn(context, mira)

  await page.goto(`/kampagnen/${campaign.id}`)
  const characters = page.getByRole('region', { name: 'Charaktere' })
  await characters.getByRole('button', { name: 'Brom bearbeiten' }).click()
  const portrait = characters.getByRole('region', { name: 'Porträt' })
  await expect(portrait.getByRole('button', { name: text.upload })).toBeEnabled()

  await portrait.getByTestId('portrait-file').setInputFiles(PICTURE)
  const crop = page.getByRole('dialog', { name: text.cropTitle })
  const box = crop.getByTestId('crop-box')
  await expect(box.getByRole('img')).toBeVisible()
  // Zoom in with the slider, then drag the picture a little.
  await crop.getByLabel('Vergrößerung').fill('2')
  const area = (await box.boundingBox())!
  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2)
  await page.mouse.down()
  await page.mouse.move(area.x + area.width / 2 + 40, area.y + area.height / 2 + 20, { steps: 5 })
  await page.mouse.up()
  await crop.getByRole('button', { name: text.cropOk }).click()

  await expect(crop).toBeHidden()
  await expect(portrait.getByText(text.uploaded)).toBeVisible()
  expect(backend.tokenImages).toHaveLength(1)
  expect(backend.tokenImages[0]).toMatchObject({
    contentType: 'image/jpeg',
    image: { origin: 'uploaded', status: 'done' },
  })

  await characters.getByRole('button', { name: 'Abbrechen' }).click()
  const thumbnail = characters.getByRole('img', { name: text.portraitAlt })
  await expect(thumbnail).toBeVisible()
  await expect
    .poll(() => thumbnail.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test('a board with an image token draws it without errors', async ({ page, context }) => {
  await new MockHub(backend).attach(context)
  const errors = watchErrors(page)
  const dm = backend.addUser({ displayName: 'Oreana', email: 'oreana@example.org' })
  const mira = backend.addUser({ displayName: 'Mira', email: 'mira@example.org' })
  const campaign = backend.addCampaign(CAMPAIGN, dm)
  backend.addMember(campaign, mira)
  const session = backend.addSession(campaign, dm)
  const brom = backend.addCharacter(campaign, mira, 'Brom')
  const encounter = backend.addEncounter(campaign, sampleMap('gorge-crossing'), {
    session,
    characters: [{ characterId: brom.id, x: 0, y: 5 }],
  })
  // Brom has a portrait, and the ogres and goblins an icon: the goblins' numbers move to a
  // badge on the edge.
  const portrait = backend.addTokenImage(campaign, 'character', brom.id)
  const typeOf = (label: string) =>
    encounter.tokens.find((token) => token.label.startsWith(label))!.creatureTypeId!
  const icon = backend.addTokenImage(campaign, 'creatureType', typeOf('Oger'))
  backend.addTokenImage(campaign, 'creatureType', typeOf('Goblin'))

  const assets: string[] = []
  page.on('response', (response) => {
    if (response.url().includes('/api/assets/')) assets.push(response.url())
  })
  backend.signIn(page.context(), mira)
  await page.goto(`/kampagnen/${campaign.id}/kampf/${encounter.id}`)
  await expect(page.locator('[data-board-surface] canvas').first()).toBeVisible()
  await expect.poll(() => assets.some((url) => url.endsWith(portrait.id))).toBe(true)
  await expect.poll(() => assets.some((url) => url.endsWith(icon.id))).toBe(true)
  await page.screenshot({
    path: `test-results/board/${test.info().project.name}-token-images.png`,
  })
  expect(errors).toEqual([])
})
