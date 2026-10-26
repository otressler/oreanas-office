import { expect, test, type Page } from '@playwright/test'
import { MockBackend } from './mockBackend.ts'
import { text } from './support.ts'

let backend: MockBackend

test.beforeEach(async ({ context }) => {
  backend = new MockBackend()
  const mira = backend.addUser({ displayName: 'Mira', email: 'mira@example.org' })
  backend.signIn(context, mira)
  await backend.attach(context)
})

/** Creates a campaign from the landing page and waits for its page. */
async function createCampaign(page: Page, name: string) {
  await page.goto('/')
  await page.getByLabel(text.campaignName).fill(name)
  await page.getByRole('button', { name: text.create }).click()
  await expect(page.getByRole('heading', { name })).toBeVisible()
}

function panel(page: Page, title: string) {
  return page.getByRole('region', { name: title })
}

/** A campaign's card on home: the whole card, not just the link on its name. */
function campaignCard(page: Page, name: string) {
  return page.getByRole('article').filter({ has: page.getByRole('link', { name }) })
}

test('creates a campaign and becomes its DM', async ({ page }) => {
  await createCampaign(page, 'Die Rabenküste')

  const campaign = backend.campaigns[0]!
  await expect(page).toHaveURL(`/kampagnen/${campaign.id}`)
  await expect(page.getByLabel(text.joinCode)).toHaveValue(campaign.joinCode)

  await page.getByRole('link', { name: 'Alle Kampagnen' }).click()
  const card = campaignCard(page, 'Die Rabenküste')
  await expect(card).toContainText(text.roleDm)
})

test('a campaign card opens the campaign from its cover, not just its name', async ({ page }) => {
  await createCampaign(page, 'Die Rabenküste')
  const campaign = backend.campaigns[0]!

  await page.getByRole('link', { name: 'Alle Kampagnen' }).click()
  // The middle of the cover, below the role's label.
  await campaignCard(page, 'Die Rabenküste').click({ position: { x: 150, y: 80 } })
  await expect(page).toHaveURL(`/kampagnen/${campaign.id}`)
})

test('joins a campaign with its code, ignoring case and dashes', async ({ page }) => {
  const dm = backend.addUser({ displayName: 'Oreana', email: 'oreana@example.org' })
  const campaign = backend.addCampaign('Das Grab der Annihilation', dm, 'KX7PQ2')

  await page.goto('/')
  await page.getByLabel(text.joinCode).fill('kx7-pq2')
  await page.getByRole('button', { name: text.joinButton }).click()

  await expect(page.getByRole('heading', { name: 'Das Grab der Annihilation' })).toBeVisible()
  await expect(page).toHaveURL(`/kampagnen/${campaign.id}`)
  // Players don't see the join code.
  await expect(page.getByLabel(text.joinCode)).toHaveCount(0)
  await expect(panel(page, 'Mitglieder')).toContainText('Mira')
  await expect(panel(page, 'Mitglieder')).toContainText(text.rolePlayer)
})

test('a wrong join code shows a German message', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel(text.joinCode).fill('NOPE99')
  await page.getByRole('button', { name: text.joinButton }).click()
  await expect(page.getByRole('alert')).toHaveText(text.joinCodeInvalid)
})

test('creates a character with a name and size', async ({ page }) => {
  await createCampaign(page, 'Die Rabenküste')

  const characters = panel(page, text.charactersTitle)
  await characters.getByRole('button', { name: text.newCharacter }).click()
  await characters.getByLabel(text.characterName).fill('Ilse Eisenhut')
  await characters.getByLabel('Größe').selectOption('small')
  await characters.getByRole('button', { name: text.create }).click()

  await expect(characters.getByText('Ilse Eisenhut')).toBeVisible()
  await expect(characters).toContainText('Klein')
  expect(backend.characters[0]).toMatchObject({ name: 'Ilse Eisenhut', size: 'small' })
})

test('creates a session and makes it active', async ({ page }) => {
  await createCampaign(page, 'Die Rabenküste')

  const sessions = panel(page, text.sessionsTitle)
  await sessions.getByRole('button', { name: text.newSession }).click()
  await sessions.getByLabel(text.sessionTitle).fill('Sitzung 1 – Die Hängebrücke')
  await sessions.getByRole('button', { name: text.create }).click()

  await expect(sessions.getByText('Sitzung 1 – Die Hängebrücke')).toBeVisible()
  await expect(sessions).toContainText('Geplant')
  // Starting happens on the session's page (knowledge/features/session-planning.md).
  await sessions.getByRole('link', { name: 'Sitzung 1 – Die Hängebrücke' }).click()
  await page.getByRole('button', { name: text.activate }).click()
  await expect(page.getByText(text.activeStatus, { exact: true }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: text.activate })).toHaveCount(0)
  expect(backend.sessions[0]).toMatchObject({ status: 'active', dmUserId: backend.users[0]!.id })

  // The landing page shows the running session.
  await page.getByRole('link', { name: 'Zur Kampagne' }).click()
  await page.getByRole('link', { name: 'Alle Kampagnen' }).click()
  const card = campaignCard(page, 'Die Rabenküste')
  await expect(card).toContainText(text.activeSessionLabel)
  await expect(card).toContainText('Sitzung 1 – Die Hängebrücke')
  await expect(card).toContainText('Spielleitung: Mira')
})

test('a DM describes the campaign, and its card on home shows the description', async ({
  page,
}) => {
  await createCampaign(page, 'Die Rabenküste')

  const editor = panel(page, 'Titelbild und Beschreibung')
  await editor.getByRole('button', { name: 'Bearbeiten' }).click()
  await editor.getByLabel('Beschreibung').fill('Schmugglerbuchten und ein grünes Leuchtfeuer.')
  await editor.getByRole('button', { name: 'Speichern' }).click()
  await expect(page.getByText('Schmugglerbuchten und ein grünes Leuchtfeuer.')).toBeVisible()

  await page.getByRole('link', { name: 'Alle Kampagnen' }).click()
  const card = campaignCard(page, 'Die Rabenküste')
  await expect(card).toContainText('Schmugglerbuchten und ein grünes Leuchtfeuer.')
  await expect(card.locator('img')).toHaveAttribute('src', '/home/cover-default-1536.webp')
})
