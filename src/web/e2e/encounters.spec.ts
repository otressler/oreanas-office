import { expect, test, type Page } from '@playwright/test'
import { MockBackend, sampleMap } from './mockBackend.ts'

// Text the specs look for; mirrors src/text/de.ts.
const text = {
  encountersTitle: 'Kämpfe',
  sessionsTitle: 'Sitzungen',
  importMap: 'Karte importieren',
  continueSession: 'Fortsetzen',
  endSession: 'Beenden',
  ready: 'Bereit',
  ended: 'Vorbei',
  setUp: 'Aufstellen und starten',
  takesPart: (name: string) => `${name} kämpft mit`,
  autoPlace: 'Automatisch aufstellen',
  start: 'Kampf starten',
  toFight: 'Zum Kampf',
  running: 'Kampf läuft',
  end: 'Kampf beenden',
  endConfirm: 'Ja, beenden',
  notRunning: 'Dieser Kampf läuft gerade nicht',
  homeTitle: 'Deine Kampagnen',
  fileLabel: 'Datei wählen',
  cellInvalid: 'Ein Feld liegt außerhalb der Karte oder steht doppelt in der Datei.',
}

let backend: MockBackend

test.beforeEach(async ({ context }) => {
  backend = new MockBackend()
  await backend.attach(context)
})

function panel(page: Page, title: string) {
  return page.getByRole('region', { name: title })
}

/** Oreana runs the campaign and tonight's session; Mira plays Ilse. */
function table() {
  const oreana = backend.addUser({ displayName: 'Oreana', email: 'oreana@example.org' })
  const mira = backend.addUser({ displayName: 'Mira', email: 'mira@example.org' })
  const campaign = backend.addCampaign('Die Rabenküste', oreana)
  backend.addMember(campaign, mira)
  const ilse = backend.addCharacter(campaign, mira, 'Ilse', { size: 'small' })
  const session = backend.addSession(campaign, oreana)
  return { oreana, mira, campaign, ilse, session }
}

/** The gorge crossing, already running with Ilse at the forest path. */
function runningFight() {
  const t = table()
  const encounter = backend.addEncounter(t.campaign, sampleMap('gorge-crossing'), {
    session: t.session,
    characters: [{ characterId: t.ilse.id, x: 0, y: 5 }],
  })
  return { ...t, encounter }
}

test('the DM imports a sample map, places a character and starts the fight', async ({
  page,
  context,
}) => {
  const { oreana, campaign, ilse, session } = table()
  backend.signIn(context, oreana)

  await page.goto(`/kampagnen/${campaign.id}`)
  await panel(page, text.sessionsTitle).getByRole('link', { name: session.title }).click()
  await panel(page, text.encountersTitle).getByRole('link', { name: text.importMap }).click()
  await page.getByRole('button', { name: /Schluchtübergang/ }).click()

  // Back on the session page, ready to start.
  await expect(page).toHaveURL(`/kampagnen/${campaign.id}/sitzungen/${session.id}`)
  const encounters = panel(page, text.encountersTitle)
  await expect(encounters).toContainText('Schluchtübergang')
  await expect(encounters).toContainText(text.ready)
  await expect(encounters).toContainText('Karte: Schluchtübergang · 4 Kreaturen')
  await encounters.getByRole('button', { name: text.setUp }).click()

  await expect(page.getByTestId('board')).toBeVisible()
  await page.getByRole('checkbox', { name: text.takesPart('Ilse') }).check()
  await page.getByRole('button', { name: text.autoPlace }).click()
  await page.getByRole('button', { name: text.start }).click()

  const encounter = backend.encounters[0]!
  await expect(page).toHaveURL(`/kampagnen/${campaign.id}/kampf/${encounter.id}`)
  await expect(page.getByRole('heading', { name: 'Schluchtübergang' })).toBeVisible()
  await expect(page.getByTestId('board')).toBeVisible()
  await expect(page.getByRole('button', { name: text.end })).toBeVisible()
  expect(encounter.status).toBe('active')
  // Placed at the forest path, the map's entrance.
  expect(encounter.tokens.find((t) => t.characterId === ilse.id)).toMatchObject({ x: 0, y: 5 })
})

test('a broken map file shows a German error and where it is', async ({ page, context }) => {
  const { oreana, campaign, session } = table()
  backend.signIn(context, oreana)

  await page.goto(`/kampagnen/${campaign.id}/sitzungen/${session.id}/importieren`)
  const file = {
    name: 'Kaputt',
    width: 3,
    height: 3,
    layout: { cells: [{ x: 5, y: 0, terrain: 'floor' }] },
  }
  await page.getByLabel(text.fileLabel).setInputFiles({
    name: 'kaputt.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(file)),
  })

  const alert = page.getByRole('alert')
  await expect(alert).toContainText(text.cellInvalid)
  await expect(alert).toContainText('Feld 1 in der Liste der Felder (layout.cells[0])')
  expect(backend.encounters).toHaveLength(0)
})

test('a player opening the app lands on the running fight', async ({ page, context }) => {
  const { mira, campaign, encounter } = runningFight()
  backend.signIn(context, mira)

  await page.goto('/')
  await expect(page).toHaveURL(`/kampagnen/${campaign.id}/kampf/${encounter.id}`)
  await expect(page.getByRole('heading', { name: 'Schluchtübergang' })).toBeVisible()
  await expect(page.getByTestId('board')).toBeVisible()
  await expect(page.getByRole('button', { name: text.end })).toHaveCount(0)

  // Back on the landing page, it doesn't bounce again and links to the fight.
  await page.goBack()
  await expect(page.getByRole('heading', { name: text.homeTitle })).toBeVisible()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('link', { name: text.toFight })).toBeVisible()
})

test('the DM ends the fight; afterwards players see it isn’t running', async ({
  page,
  context,
}) => {
  const { oreana, mira, campaign, encounter, session } = runningFight()
  backend.signIn(context, oreana)

  await page.goto(`/kampagnen/${campaign.id}`)
  const sessions = panel(page, text.sessionsTitle)
  await expect(sessions).toContainText(text.running)
  await sessions.getByRole('link', { name: text.toFight }).click()
  await expect(page.getByTestId('board')).toBeVisible()

  await page.getByRole('button', { name: text.end }).click()
  await page.getByRole('button', { name: text.endConfirm }).click()

  // Back on the session page, with the fight over.
  await expect(page).toHaveURL(`/kampagnen/${campaign.id}/sitzungen/${session.id}`)
  await expect(panel(page, text.encountersTitle)).toContainText(text.ended)
  await expect(page.getByRole('link', { name: text.toFight })).toHaveCount(0)
  expect(encounter.status).toBe('ended')

  backend.signIn(context, mira)
  await page.goto(`/kampagnen/${campaign.id}/kampf/${encounter.id}`)
  await expect(page.getByRole('heading', { name: text.notRunning })).toBeVisible()
})

// knowledge/domain/session.md, "Continuing": the group didn't get through it in one evening.
test('continuing an ended session brings back the fight it cut off', async ({ page, context }) => {
  const { oreana, campaign, encounter, session } = runningFight()
  backend.signIn(context, oreana)

  await page.goto(`/kampagnen/${campaign.id}/sitzungen/${session.id}`)
  await page.getByRole('button', { name: text.endSession, exact: true }).click()
  await expect(page.getByText(/Schluchtübergang.*läuft dann weiter/)).toBeVisible()
  expect(encounter.status).toBe('ended')

  await page.getByRole('button', { name: text.continueSession }).click()

  await expect(page.getByRole('link', { name: text.toFight })).toBeVisible()
  expect(encounter.status).toBe('active')
  expect(session.status).toBe('active')
})
