// The map list and the offline map pages (stage 5): maps live in the browser, so
// the list and the editor keep working with the connection gone.
import { expect, test, type Page } from '@playwright/test'
import { MockBackend } from './mockBackend.ts'
import { text, waitForServiceWorker } from './support.ts'

const CAMPAIGN = 'Die Rabenküste'

let backend: MockBackend

test.beforeEach(async ({ context }) => {
  backend = new MockBackend()
  const jennie = backend.addUser({ displayName: 'Jennie', email: 'jennie@example.org' })
  backend.addCampaign(CAMPAIGN, jennie)
  backend.signIn(context, jennie)
  await backend.attach(context)
})

/** From the landing page to the campaign's map list. */
async function openMapList(page: Page) {
  await page.goto('/')
  await page.getByRole('link', { name: new RegExp(CAMPAIGN) }).click()
  await expect(page.getByRole('heading', { name: CAMPAIGN })).toBeVisible()
  await page.getByRole('link', { name: text.campaignMaps }).click()
  await expect(page.getByRole('heading', { name: text.mapListTitle(CAMPAIGN) })).toBeVisible()
}

const mapsPanel = (page: Page) => page.getByRole('region', { name: 'Karten', exact: true })

test('a DM builds maps in the browser and keeps working on them offline', async ({
  page,
  context,
}) => {
  test.skip(test.info().project.name === 'phone', 'The editor is for laptops')
  await openMapList(page)

  // A new map opens in the editor.
  const form = page.getByRole('region', { name: text.newMapTitle })
  await form.getByLabel(text.mapName).fill('Schluchtübergang')
  await form.getByRole('button', { name: text.createMap }).click()
  await expect(page.getByRole('heading', { name: 'Schluchtübergang' })).toBeVisible()
  await expect(page).toHaveURL(/\/kampagnen\/[^/]+\/karten\/[0-9a-f-]{36}$/)
  await expect(page.getByText(text.localOnly)).toBeVisible()

  // Back in the list: duplicate, archive the copy, bring it back.
  await page.getByRole('link', { name: text.backToMapList }).click()
  await expect(mapsPanel(page).getByText('Schluchtübergang')).toBeVisible()
  await expect(mapsPanel(page).getByText(text.localOnly)).toBeVisible()

  await page
    .getByRole('button', { name: text.duplicateMap('Schluchtübergang'), exact: true })
    .click()
  await expect(mapsPanel(page).getByText('Schluchtübergang (Kopie)')).toBeVisible()

  await page
    .getByRole('button', { name: text.archiveMap('Schluchtübergang (Kopie)'), exact: true })
    .click()
  await expect(mapsPanel(page).getByText('Schluchtübergang (Kopie)')).toHaveCount(0)
  const archived = page.getByText(text.archivedMaps(1))
  await expect(archived).toBeVisible()
  await archived.click()
  await page
    .getByRole('button', { name: text.restoreMap('Schluchtübergang (Kopie)'), exact: true })
    .click()
  await expect(mapsPanel(page).getByText('Schluchtübergang (Kopie)')).toBeVisible()
  await expect(page.getByText(text.archivedMaps(1))).toHaveCount(0)

  // Offline: the campaign page needs the server, so it offers the offline maps instead.
  await waitForServiceWorker(page)
  await page.getByRole('link', { name: text.backToCampaign }).click()
  await expect(page.getByRole('heading', { name: CAMPAIGN })).toBeVisible()
  await context.setOffline(true)
  await page.reload()

  await expect(page.getByRole('heading', { name: text.offlineTitle })).toBeVisible()
  await page.getByRole('link', { name: text.offlineMapsLink }).click()
  await expect(page.getByRole('heading', { name: text.offlineMapsTitle })).toBeVisible()
  await page.getByRole('link', { name: new RegExp(CAMPAIGN) }).click()

  await expect(page.getByRole('heading', { name: text.mapListTitle(CAMPAIGN) })).toBeVisible()
  await expect(mapsPanel(page).getByText('Schluchtübergang', { exact: true })).toBeVisible()
  await expect(mapsPanel(page).getByText('Schluchtübergang (Kopie)')).toBeVisible()

  await page.getByRole('link', { name: text.editMap('Schluchtübergang'), exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Schluchtübergang' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Exportieren' })).toBeVisible()
})

test('on a phone the map list is read-only, with a hint about the editor', async ({ page }) => {
  test.skip(test.info().project.name !== 'phone', 'Only narrow screens')
  await openMapList(page)

  await expect(page.getByText(text.editorNarrowTitle)).toBeVisible()
  await expect(page.getByRole('region', { name: text.newMapTitle })).toHaveCount(0)
})
