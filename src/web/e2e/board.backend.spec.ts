// Runs against the real backend (`npm run test:e2e:backend`): the stage 3 gate on
// two devices. The DM imports the gorge crossing, places a player's character and
// starts the fight; the player opens the app and lands on the board; the DM ends it.
import { randomUUID } from 'node:crypto'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { text } from './support.ts'

async function registerOnNewDevice(browser: Browser, inviteToken: string, displayName: string) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`/einladung/${inviteToken}`)
  await page.getByLabel(text.displayName).fill(displayName)
  await page.getByLabel(text.email).fill(`${randomUUID()}@example.test`)
  await page.getByLabel(text.password, { exact: true }).fill('zwergenbart')
  await page.getByRole('button', { name: text.registerButton }).click()
  await expect(page.getByRole('heading', { name: text.homeTitle })).toBeVisible()
  return page
}

function panel(page: Page, title: string) {
  return page.getByRole('region', { name: title })
}

test('the DM starts a fight on the gorge crossing and a player lands on it', async ({
  browser,
  page,
}) => {
  await page.goto('/')
  const response = await page.request.post('/api/testing/invites')
  const token = ((await response.json()) as { url: string }).url.split('/').pop()!

  const oreana = await registerOnNewDevice(browser, token, 'Oreana')
  const mira = await registerOnNewDevice(browser, token, 'Mira')

  // Oreana's campaign, Mira joins and brings Ilse.
  const campaignName = `Die Rabenküste ${randomUUID().slice(0, 4)}`
  await oreana.getByLabel(text.campaignName).fill(campaignName)
  await oreana.getByRole('button', { name: text.create }).click()
  await expect(oreana.getByRole('heading', { name: campaignName })).toBeVisible()
  const joinCode = await oreana.getByLabel(text.joinCode).inputValue()
  await mira.getByLabel(text.joinCode).fill(joinCode)
  await mira.getByRole('button', { name: text.joinButton }).click()
  await expect(mira.getByRole('heading', { name: campaignName })).toBeVisible()
  const characters = panel(mira, text.charactersTitle)
  await characters.getByRole('button', { name: text.newCharacter }).click()
  await characters.getByLabel(text.characterName).fill('Ilse')
  await characters.getByRole('button', { name: text.create }).click()
  await expect(characters).toContainText('Mittelgroß')

  // Oreana runs tonight's session and imports the gorge crossing.
  await oreana.reload()
  const sessions = panel(oreana, text.sessionsTitle)
  await sessions.getByRole('button', { name: text.newSession }).click()
  await sessions.getByLabel(text.sessionTitle).fill('Sitzung 1 – Die Hängebrücke')
  await sessions.getByRole('button', { name: text.create }).click()
  await sessions.getByRole('button', { name: text.activate }).click()
  await expect(sessions).toContainText(text.activeStatus)

  await panel(oreana, 'Kämpfe').getByRole('link', { name: 'Karte importieren' }).click()
  await oreana.getByRole('button', { name: /Schluchtübergang/ }).click()
  const encounters = panel(oreana, 'Kämpfe')
  await expect(encounters).toContainText('4 Kreaturen')
  await encounters.getByRole('link', { name: 'Aufstellen und starten' }).click()

  // Ilse takes part; she goes to the forest path.
  await oreana.getByRole('checkbox', { name: 'Ilse kämpft mit' }).check()
  await oreana.getByRole('button', { name: 'Automatisch aufstellen' }).click()
  await oreana.getByRole('button', { name: 'Kampf starten' }).click()
  await expect(oreana.getByRole('button', { name: 'Kampf beenden' })).toBeVisible()
  await expect(oreana.locator('[data-board-surface] canvas').first()).toBeVisible()

  // Mira opens the app and lands on the fight, without the DM's controls.
  await mira.goto('/')
  await expect(mira).toHaveURL(/\/kampf\//)
  await expect(mira.getByRole('heading', { name: 'Schluchtübergang' })).toBeVisible()
  await expect(mira.locator('[data-board-surface] canvas').first()).toBeVisible()
  await expect(mira.getByRole('button', { name: 'Kampf beenden' })).toHaveCount(0)

  // The board Mira gets has her character and the four creatures.
  const board = await mira.evaluate(
    async (url) => (await fetch(url)).json(),
    mira
      .url()
      .replace(/\/kampagnen\/([^/]+)\/kampf\/([^/]+)$/, '/api/campaigns/$1/encounters/$2/board'),
  )
  expect(board.tokens.map((t: { label: string }) => t.label)).toEqual([
    'Goblin 1',
    'Goblin 2',
    'Goblin 3',
    'Oger 1',
    'Ilse',
  ])

  // Oreana ends the fight; after a reload Mira sees it isn't running any more.
  await oreana.getByRole('button', { name: 'Kampf beenden' }).click()
  await oreana.getByRole('button', { name: 'Ja, beenden' }).click()
  await expect(oreana).toHaveURL(/\/kampagnen\/[^/]+$/)
  await mira.reload()
  await expect(mira.getByText('Dieser Kampf läuft gerade nicht')).toBeVisible()
})
