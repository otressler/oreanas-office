// Runs against the real backend (`npm run test:e2e:backend`): the stage 4 gate on two
// devices. Oreana runs the fight on the gorge crossing and Mira plays Ilse. A move shows
// up live on the other device, Mira can't take the goblin, undo works until someone
// else moves the token, and a device that was offline catches up when it reconnects.
import { randomUUID } from 'node:crypto'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { tapCell, text } from './support.ts'

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

const indicator = (page: Page) => page.getByTestId('connection-indicator')

/** Oreana's campaign with Mira and her character Ilse, and the gorge crossing running. */
async function startFight(browser: Browser, page: Page) {
  await page.goto('/')
  const response = await page.request.post('/api/testing/invites')
  const token = ((await response.json()) as { url: string }).url.split('/').pop()!
  const oreana = await registerOnNewDevice(browser, token, 'Oreana')
  const mira = await registerOnNewDevice(browser, token, 'Mira')

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
  await characters.getByLabel(text.speed).fill('9')
  await characters.getByRole('button', { name: text.create }).click()
  await expect(characters).toContainText('Geschwindigkeit 9 m')

  await oreana.reload()
  const sessions = panel(oreana, text.sessionsTitle)
  await sessions.getByRole('button', { name: text.newSession }).click()
  await sessions.getByLabel(text.sessionTitle).fill('Sitzung 1 – Die Hängebrücke')
  await sessions.getByRole('button', { name: text.create }).click()
  await sessions.getByRole('button', { name: text.activate }).click()
  await expect(sessions).toContainText(text.activeStatus)
  await panel(oreana, 'Kämpfe').getByRole('link', { name: 'Karte importieren' }).click()
  await oreana.getByRole('button', { name: /Schluchtübergang/ }).click()
  await panel(oreana, 'Kämpfe').getByRole('link', { name: 'Aufstellen und starten' }).click()

  // Ilse goes to the forest path, at (0, 5).
  await oreana.getByRole('checkbox', { name: 'Ilse kämpft mit' }).check()
  await oreana.getByRole('button', { name: 'Automatisch aufstellen' }).click()
  await oreana.getByRole('button', { name: 'Kampf starten' }).click()
  await expect(indicator(oreana)).toHaveAttribute('data-status', 'connected')

  await mira.goto('/')
  await expect(mira).toHaveURL(/\/kampf\//)
  await expect(indicator(mira)).toHaveAttribute('data-status', 'connected')
  return { oreana, mira }
}

/** Where Ilse stands on the server. */
async function ilse(page: Page) {
  const url = page
    .url()
    .replace(/\/kampagnen\/([^/]+)\/kampf\/([^/]+)$/, '/api/campaigns/$1/encounters/$2/board')
  const board = (await page.evaluate(async (u) => (await fetch(u)).json(), url)) as {
    tokens: { label: string; x: number; y: number }[]
  }
  const token = board.tokens.find((t) => t.label === 'Ilse')!
  return { x: token.x, y: token.y }
}

/** Select the token on (x, y), then tap the target twice: preview and confirm. */
async function move(page: Page, from: [number, number], to: [number, number], name: string) {
  await tapCell(page, ...from)
  await expect(page.getByText(text.pickTarget(name))).toBeVisible()
  await tapCell(page, ...to)
  await expect(page.getByText(text.confirmHint(name))).toBeVisible()
  await tapCell(page, ...to)
  await expect(page.getByText(text.confirmHint(name))).toHaveCount(0)
}

/** The device sees Ilse on (x, y): tapping that cell selects her. Escape lets go again. */
async function seesIlseAt(page: Page, x: number, y: number) {
  await tapCell(page, x, y)
  await expect(page.getByText(text.pickTarget('Ilse'))).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByText(text.pickTarget('Ilse'))).toHaveCount(0)
}

test('players and the DM move tokens live on both devices', async ({ browser, page }) => {
  const { oreana, mira } = await startFight(browser, page)
  expect(await ilse(mira)).toEqual({ x: 0, y: 5 })

  // Mira can't take the goblin: tapping it only shows what it is.
  await tapCell(mira, 14, 4)
  await expect(mira.getByText('Goblin 1')).toBeVisible()
  await expect(mira.getByText(text.pickTarget('Goblin 1'))).toHaveCount(0)

  // The gorge is refused; the bridge isn't. Oreana sees Ilse there without reloading.
  await tapCell(mira, 0, 5)
  await tapCell(mira, 9, 2)
  await expect(mira.getByText(text.invalidTarget)).toBeVisible()
  await mira.keyboard.press('Escape')
  await move(mira, [0, 5], [9, 5], 'Ilse')
  await expect.poll(() => ilse(mira)).toEqual({ x: 9, y: 5 })
  await seesIlseAt(oreana, 9, 5)

  // Mira takes it back; Oreana sees her back on the forest path.
  await mira.getByRole('button', { name: text.undo }).click()
  await expect(mira.getByRole('button', { name: text.undo })).toHaveCount(0)
  await expect.poll(() => ilse(mira)).toEqual({ x: 0, y: 5 })
  await seesIlseAt(oreana, 0, 5)

  // Once the DM moves Ilse after her, Mira's undo is gone.
  await move(mira, [0, 5], [2, 8], 'Ilse')
  await expect(mira.getByRole('button', { name: text.undo })).toBeVisible()
  await move(oreana, [2, 8], [3, 9], 'Ilse')
  await expect(mira.getByRole('button', { name: text.undo })).toHaveCount(0)
  await seesIlseAt(mira, 3, 9)

  // Mira's phone loses the connection: moving is off. The DM moves Ilse meanwhile;
  // once Mira is back, her board shows where Ilse is now.
  await mira.context().setOffline(true)
  await expect(indicator(mira)).not.toHaveAttribute('data-status', 'connected')
  await move(oreana, [3, 9], [5, 10], 'Ilse')
  await mira.context().setOffline(false)
  await expect(indicator(mira)).toHaveAttribute('data-status', 'connected', { timeout: 30_000 })
  await seesIlseAt(mira, 5, 10)
})
