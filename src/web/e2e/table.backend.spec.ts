// Runs against the real backend (`npm run test:e2e:backend`): two people on two
// devices register through one invite, one creates a campaign, the other joins
// with its code, and they set up a character and a session together.
import { randomUUID } from 'node:crypto'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { addCharacter, text } from './support.ts'

/** An invite from the E2E-only endpoint; the token is the last part of its URL. */
async function createInviteToken(page: Page) {
  const response = await page.request.post('/api/testing/invites')
  expect(response.ok()).toBe(true)
  const { url } = (await response.json()) as { url: string }
  return url.split('/').pop()!
}

/** A new device (browser context) with a freshly registered account. */
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

test('two people register, create and join a campaign, and run a session', async ({
  browser,
  page,
}) => {
  await page.goto('/')
  const token = await createInviteToken(page)

  // The same invite link works for both.
  const mira = await registerOnNewDevice(browser, token, 'Mira')
  const brom = await registerOnNewDevice(browser, token, 'Brom')

  // Mira creates the campaign and becomes its DM.
  const campaignName = `Die Rabenküste ${randomUUID().slice(0, 4)}`
  await mira.getByLabel(text.campaignName).fill(campaignName)
  await mira.getByRole('button', { name: text.create }).click()
  await expect(mira.getByRole('heading', { name: campaignName })).toBeVisible()
  const joinCode = await mira.getByLabel(text.joinCode).inputValue()
  expect(joinCode).toMatch(/^[A-Z2-9]{6}$/)

  // Brom joins on his device, typing the code in lowercase.
  await brom.getByLabel(text.joinCode).fill(joinCode.toLowerCase())
  await brom.getByRole('button', { name: text.joinButton }).click()
  await expect(brom.getByRole('heading', { name: campaignName })).toBeVisible()
  await expect(brom.getByLabel(text.joinCode)).toHaveCount(0)
  await expect(panel(brom, 'Mitglieder')).toContainText('Mira')

  // Brom creates his character with 9 m; Mira sees it as 9 m too.
  const characters = panel(brom, text.charactersTitle)
  await addCharacter(brom, 'Brom Eisenbart')
  await expect(characters).toContainText('Mittelgroß')

  await mira.reload()
  await expect(panel(mira, text.charactersTitle)).toContainText('Brom Eisenbart')
  await expect(panel(mira, text.charactersTitle)).toContainText('Mittelgroß')

  // Mira promotes Brom, creates a session, starts it and hands it to him.
  const members = panel(mira, 'Mitglieder')
  await members.getByRole('button', { name: 'Zur Spielleitung machen' }).click()
  await expect(members.getByRole('button', { name: 'Zur Spielleitung machen' })).toHaveCount(0)

  const sessions = panel(mira, text.sessionsTitle)
  await sessions.getByRole('button', { name: text.newSession }).click()
  await sessions.getByLabel(text.sessionTitle).fill('Sitzung 1 – Die Hängebrücke')
  await sessions.getByRole('button', { name: text.create }).click()
  await sessions.getByRole('link', { name: 'Sitzung 1 – Die Hängebrücke' }).click()
  await mira.getByRole('button', { name: text.activate }).click()
  await expect(mira.getByText(text.activeStatus, { exact: true }).first()).toBeVisible()

  await mira.getByRole('button', { name: 'Spielleitung wechseln' }).click()
  await mira.getByLabel('Spielleitung').selectOption({ label: 'Brom' })
  await mira.getByRole('button', { name: 'Übernehmen' }).click()
  await expect(mira.getByText('Spielleitung: Brom')).toBeVisible()

  // Brom's landing page shows the running session with him as DM.
  await brom.goto('/')
  const card = brom.getByRole('link', { name: new RegExp(campaignName) })
  await expect(card).toContainText(text.activeSessionLabel)
  await expect(card).toContainText('Sitzung 1 – Die Hängebrücke')
  await expect(card).toContainText('Spielleitung: Brom')

  // Both stay signed in on a fresh load of the app.
  await mira.goto('/')
  await expect(mira.getByRole('link', { name: text.profileLink('Mira') })).toBeVisible()
})
