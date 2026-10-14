// Sync (stage 6): maps built on the device reach the server, conflicts ask which version
// to keep, and a campaign made offline has no join code until it is synced.
import { expect, test, type Page } from '@playwright/test'
import { MockBackend } from './mockBackend.ts'

// Text the spec looks for; mirrors src/text/de.ts (sync, maps, campaign).
const text = {
  sync: 'Sync',
  allSynced: 'Alles synchronisiert',
  pendingOne: '1 Änderung nicht synchronisiert',
  offlinePending: 'Offline – 1 Änderung nicht synchronisiert',
  review: '1 Problem prüfen',
  dialog: 'Synchronisierung prüfen',
  keepMine: 'Meine behalten',
  takeServer: 'Server-Version übernehmen',
  keepBoth: 'Beide behalten',
  localOnly: 'Nur auf diesem Gerät',
  conflictMark: 'Konflikt',
  thisDevice: 'Auf diesem Gerät',
  onServer: 'Auf dem Server',
  newMapTitle: 'Neue Karte',
  mapName: 'Name',
  createMap: 'Anlegen',
  backToMapList: 'Zur Kartenliste',
  newCampaign: 'Neue Kampagne',
  campaignName: 'Name der Kampagne',
  create: 'Anlegen',
  joinCodeTitle: 'Beitrittscode',
  localBody:
    'Diese Kampagne gibt es nur auf diesem Gerät. Sie wird zuerst synchronisiert; danach gibt es Beitrittscode, Einladungen, Charaktere und Sitzungen.',
  campaignMaps: /^Karten/,
}

const CAMPAIGN = 'Die Rabenküste'

let backend: MockBackend
let campaign: ReturnType<MockBackend['addCampaign']>
let felix: ReturnType<MockBackend['addUser']>

test.beforeEach(async ({ context }) => {
  test.skip(test.info().project.name === 'phone', 'The editor is for laptops')
  backend = new MockBackend()
  const jennie = backend.addUser({ displayName: 'Jennie', email: 'jennie@example.org' })
  felix = backend.addUser({ displayName: 'Felix', email: 'felix@example.org' })
  campaign = backend.addCampaign(CAMPAIGN, jennie)
  backend.addMember(campaign, felix, 'dm')
  backend.signIn(context, jennie)
  await backend.attach(context)
})

const mapsPanel = (page: Page) => page.getByRole('region', { name: 'Karten', exact: true })

async function openMapList(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: new RegExp(CAMPAIGN) }).click()
  await expect(page.getByRole('heading', { name: CAMPAIGN })).toBeVisible()
  await page.getByRole('link', { name: text.campaignMaps }).click()
  await expect(page.getByRole('heading', { name: `Karten – ${CAMPAIGN}` })).toBeVisible()
}

/** Presses "Sync" once no sync is running. */
async function sync(page: Page) {
  const button = page.getByRole('button', { name: text.sync, exact: true })
  await expect(button).toBeEnabled()
  await button.click()
}

test('a map built without a connection is pushed when the connection is back', async ({
  page,
  context,
}) => {
  await openMapList(page)

  const form = page.getByRole('region', { name: text.newMapTitle })
  await form.getByLabel(text.mapName).fill('Schluchtübergang')
  await form.getByRole('button', { name: text.createMap }).click()
  await expect(page.getByRole('heading', { name: 'Schluchtübergang' })).toBeVisible()
  await expect(page.getByText(text.pendingOne)).toBeVisible()

  // Without a connection the map waits; nothing is lost and nothing complains.
  await context.setOffline(true)
  await expect(page.getByText(text.offlinePending)).toBeVisible()
  expect(backend.syncItems.size).toBe(0)

  // The connection comes back and the sync starts by itself.
  await context.setOffline(false)
  await expect(page.getByText(text.allSynced)).toBeVisible()
  expect([...backend.syncItems.values()].map((item) => item.map?.name)).toEqual([
    'Schluchtübergang',
  ])

  await page.getByRole('link', { name: text.backToMapList }).click()
  await expect(mapsPanel(page).getByText('Schluchtübergang')).toBeVisible()
  await expect(mapsPanel(page).getByText(text.localOnly)).toHaveCount(0)
})

/** Opens the map in the editor; the list's own "Name" field must be gone before typing. */
async function openEditor(page: Page, name: string) {
  await page.getByRole('link', { name: `${name} bearbeiten`, exact: true }).click()
  await expect(page.getByRole('button', { name: 'Exportieren' })).toBeVisible()
}

test('Sync brings a map from another device and pushes the changes made here', async ({ page }) => {
  const item = backend.addSyncedMap(campaign, 'Klamm', felix)
  await openMapList(page)

  await sync(page)
  await expect(mapsPanel(page).getByText('Klamm', { exact: true })).toBeVisible()
  await expect(page.getByText(text.allSynced)).toBeVisible()

  await openEditor(page, 'Klamm')
  await page.getByLabel(text.mapName, { exact: true }).fill('Klamm im Nebel')
  // The autosave has written the change when the header counts it.
  await expect(page.getByText(text.pendingOne)).toBeVisible()
  await sync(page)
  await expect(page.getByText(text.allSynced)).toBeVisible()

  expect(backend.syncItems.get(item.id)?.map?.name).toBe('Klamm im Nebel')
  expect(backend.syncItems.get(item.id)?.version).toBe(2)
})

/** A map renamed here and, meanwhile, by Felix: the page shows the conflict dialog. */
async function makeConflict(page: Page) {
  const item = backend.addSyncedMap(campaign, 'Klamm', felix)
  await openMapList(page)
  await sync(page)
  await expect(mapsPanel(page).getByText('Klamm', { exact: true })).toBeVisible()

  await openEditor(page, 'Klamm')
  await page.getByLabel(text.mapName, { exact: true }).fill('Klamm von Jennie')
  await expect(page.getByText(text.pendingOne)).toBeVisible()
  backend.renameSyncedMap(item.id, 'Klamm von Felix', felix)

  await sync(page)
  await page.getByRole('button', { name: text.review }).click()
  const dialog = page.getByRole('dialog', { name: text.dialog })
  await expect(dialog.getByRole('heading', { name: text.thisDevice })).toBeVisible()
  await expect(dialog.getByRole('heading', { name: text.onServer })).toBeVisible()
  await expect(dialog.getByText(/von Felix,/)).toBeVisible()
  await expect(dialog.getByText('Klamm von Jennie', { exact: true })).toBeVisible()
  await expect(dialog.getByText('Klamm von Felix', { exact: true })).toBeVisible()
  return { item, dialog }
}

test('conflict: "Meine behalten" pushes the local version on top', async ({ page }) => {
  const { item, dialog } = await makeConflict(page)

  await dialog.getByRole('button', { name: text.keepMine }).click()

  await expect.poll(() => backend.syncItems.get(item.id)?.map?.name).toBe('Klamm von Jennie')
  expect(backend.syncItems.get(item.id)?.version).toBe(3)
  await expect(page.getByText(text.allSynced)).toBeVisible()
})

test('conflict: "Server-Version übernehmen" throws the local changes away', async ({ page }) => {
  const { item, dialog } = await makeConflict(page)

  await dialog.getByRole('button', { name: text.takeServer }).click()
  await expect(page.getByRole('dialog')).toHaveCount(1) // "Alles erledigt."
  await page.getByRole('button', { name: 'Schließen' }).first().click()
  await page.getByRole('link', { name: text.backToMapList }).click()

  await expect(mapsPanel(page).getByText('Klamm von Felix', { exact: true })).toBeVisible()
  await expect(mapsPanel(page).getByText('Klamm von Jennie')).toHaveCount(0)
  expect(backend.syncItems.get(item.id)?.map?.name).toBe('Klamm von Felix')
})

test('conflict: "Beide behalten" keeps a copy next to the server version', async ({ page }) => {
  const { item, dialog } = await makeConflict(page)

  await dialog.getByRole('button', { name: text.keepBoth }).click()
  await page.getByRole('button', { name: 'Schließen' }).first().click()
  await page.getByRole('link', { name: text.backToMapList }).click()

  await expect(mapsPanel(page).getByText('Klamm von Felix', { exact: true })).toBeVisible()
  await expect(mapsPanel(page).getByText('Klamm von Jennie (Kopie)')).toBeVisible()
  // The copy is a new item and reaches the server too.
  await expect.poll(() => backend.syncItems.size).toBe(2)
  expect(backend.syncItems.get(item.id)?.map?.name).toBe('Klamm von Felix')
})

test('a campaign made offline has no join code until it is synced', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Deine Kampagnen' })).toBeVisible()
  await page.goto('/karten')

  const form = page.getByRole('region', { name: text.newCampaign })
  await form.getByLabel(text.campaignName).fill('Die Nebelinsel')
  await form.getByRole('button', { name: text.create }).click()
  await expect(page.getByRole('link', { name: /Die Nebelinsel/ })).toContainText(text.localOnly)
  expect(backend.campaigns.some((c) => c.name === 'Die Nebelinsel')).toBe(false)

  // The home page lists it; its page says it is synced first and offers no code.
  await page.getByRole('link', { name: 'Oreana' }).first().click()
  await page.getByRole('link', { name: /Die Nebelinsel/ }).click()
  await expect(page.getByRole('heading', { name: 'Die Nebelinsel' })).toBeVisible()
  await expect(page.getByText(text.localBody)).toBeVisible()
  await expect(page.getByText(text.joinCodeTitle, { exact: true })).toHaveCount(0)

  await sync(page)
  await expect(page.getByText(text.joinCodeTitle, { exact: true })).toBeVisible()
  expect(backend.campaigns.some((c) => c.name === 'Die Nebelinsel')).toBe(true)
})
