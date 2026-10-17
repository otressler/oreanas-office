// The fight the backend specs start from (`npm run test:e2e:backend`): Oreana runs the
// gorge crossing in a new campaign, and Mira plays Ilse, who stands on the forest path at
// (0, 5). Each call makes new accounts and a new campaign, so specs don't share state.
import { randomUUID } from 'node:crypto'
import { expect, type Browser, type Page } from '@playwright/test'
import { tapCell, text } from './support.ts'

export async function registerOnNewDevice(
  browser: Browser,
  inviteToken: string,
  displayName: string,
) {
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

export function panel(page: Page, title: string) {
  return page.getByRole('region', { name: title })
}

export const indicator = (page: Page) => page.getByTestId('connection-indicator')

/** Oreana's campaign with Mira and her character Ilse, and the gorge crossing running. */
export async function startFight(browser: Browser, page: Page) {
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
  await characters.getByRole('button', { name: text.create }).click()
  await expect(characters).toContainText('Mittelgroß')

  await oreana.reload()
  const sessions = panel(oreana, text.sessionsTitle)
  await sessions.getByRole('button', { name: text.newSession }).click()
  await sessions.getByLabel(text.sessionTitle).fill('Sitzung 1 – Die Hängebrücke')
  await sessions.getByRole('button', { name: text.create }).click()
  // The session's page holds its fights (knowledge/features/session-planning.md).
  await sessions.getByRole('link', { name: 'Sitzung 1 – Die Hängebrücke' }).click()
  await oreana.getByRole('button', { name: text.activate }).click()
  await expect(oreana.getByText(text.activeStatus, { exact: true }).first()).toBeVisible()
  await panel(oreana, 'Kämpfe').getByRole('link', { name: 'Karte importieren' }).click()
  await oreana.getByRole('button', { name: /Schluchtübergang/ }).click()
  await panel(oreana, 'Kämpfe').getByRole('button', { name: 'Aufstellen und starten' }).click()

  // Ilse goes to the forest path, at (0, 5).
  await oreana.getByRole('checkbox', { name: 'Ilse kämpft mit' }).check()
  await oreana.getByRole('button', { name: 'Automatisch aufstellen' }).click()
  await oreana.getByRole('button', { name: 'Kampf starten' }).click()
  await expect(indicator(oreana)).toHaveAttribute('data-status', 'connected')

  await mira.goto('/')
  await expect(mira).toHaveURL(/\/kampf\//)
  await expect(indicator(mira)).toHaveAttribute('data-status', 'connected')
  await clearBoard(oreana)
  await clearBoard(mira)
  return { oreana, mira }
}

/** Where a token stands on the server; null when it isn't on the board. */
export async function position(page: Page, label: string) {
  const url = page
    .url()
    .replace(/\/kampagnen\/([^/]+)\/kampf\/([^/]+)$/, '/api/campaigns/$1/encounters/$2/board')
  const board = (await page.evaluate(async (u) => (await fetch(u)).json(), url)) as {
    tokens: { label: string; x: number; y: number }[]
  }
  const token = board.tokens.find((t) => t.label === label)
  return token ? { x: token.x, y: token.y } : null
}

export const ilse = (page: Page) => position(page, 'Ilse')

/**
 * Closes the one-time double-tap hint and folds the token card to one line, which it
 * stays for the next token, so neither covers the cells the specs tap. A phone's card
 * otherwise takes the bottom quarter of the screen, as a person would fold it too.
 */
export async function clearBoard(page: Page) {
  await page.getByRole('button', { name: 'Hinweis schließen' }).click()
  await tapCell(page, 1, 1)
  const card = page.getByRole('region', { name: 'Feld', exact: true })
  await card.getByRole('button', { name: 'Karte einklappen' }).click()
  await card.getByRole('button', { name: 'Karte schließen' }).click()
}
