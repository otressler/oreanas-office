// Stage 10, spectator lane: the join page's choices (QR link and typed code), the spectator
// screen following a fight's start and end by itself, and a member's "Als Zuschauer öffnen",
// against the mock backend and hub (spectatorMock.ts). The real hub runs in the backend tests.
import { expect, test, type Page } from '@playwright/test'
import { MockBackend, sampleMap } from './mockBackend.ts'
import { MockHub } from './mockHub.ts'
import { SpectatorMock } from './spectatorMock.ts'
import { tapCell } from './support.ts'

let backend: MockBackend
let hub: MockHub
let spectators: SpectatorMock

test.beforeEach(async ({ context }) => {
  backend = new MockBackend()
  hub = new MockHub(backend)
  spectators = new SpectatorMock(backend, hub)
  await backend.attach(context)
  await hub.attach(context)
  await spectators.attach(context)
})

const JOIN_CODE = 'RAB234'

/** A campaign with its running session and no fight yet; Dana belongs to nothing. */
function table() {
  const dm = backend.addUser({ displayName: 'Oreana', email: 'oreana@example.org' })
  const player = backend.addUser({ displayName: 'Mira', email: 'mira@example.org' })
  const guest = backend.addUser({ displayName: 'Dana', email: 'dana@example.org' })
  const campaign = backend.addCampaign('Die Rabenküste', dm, JOIN_CODE)
  backend.addMember(campaign, player)
  const session = backend.addSession(campaign, dm)
  const hero = backend.addCharacter(campaign, player, 'Held')
  /** The DM starts the gorge crossing: the fight runs and the screens are told. */
  const startFight = () => {
    const encounter = backend.addEncounter(campaign, sampleMap('gorge-crossing'), {
      session,
      characters: [{ characterId: hero.id, x: 0, y: 5 }],
    })
    spectators.announceStart(encounter)
    return encounter
  }
  return { dm, player, guest, campaign, session, hero, startFight }
}

const screen = (page: Page) => page.getByRole('main', { name: 'Zuschaueransicht' })
const board = (page: Page) => page.locator('[data-board-surface] canvas').first()
const menu = (page: Page) => page.getByRole('button', { name: 'Menü der Zuschaueransicht' })

test('the QR link offers both choices, and "Nur zuschauen" opens a screen that follows the fight', async ({
  page,
}) => {
  const t = table()
  const unhandled: string[] = []
  page.on('console', (message) => {
    if (message.text().includes('No client method')) unhandled.push(message.text())
  })
  backend.signIn(page.context(), t.guest)
  await page.goto(`/beitreten/${JOIN_CODE}?sitzung=${t.session.id}`)

  await expect(page.getByRole('heading', { name: 'Die Rabenküste' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Mitspielen' })).toBeVisible()
  await page.getByRole('button', { name: 'Nur zuschauen' }).click()

  // A session spectator entry, not a membership.
  await expect(page).toHaveURL(
    new RegExp(`/kampagnen/${t.campaign.id}/sitzungen/${t.session.id}/zuschauen$`),
  )
  expect(t.campaign.members.some((m) => m.userId === t.guest.id)).toBe(false)
  expect(spectators.entries).toEqual([{ userId: t.guest.id, sessionId: t.session.id }])
  await expect(screen(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sitzung 1' })).toBeVisible()
  await expect(page.getByText('Der nächste Kampf beginnt gleich')).toBeVisible()
  await expect(page.getByRole('img', { name: 'QR-Code zum Beitreten' })).toBeVisible()
  await expect(page.getByText('Die Helden')).toBeVisible()
  await expect.poll(() => spectators.watchingCount(t.session.id)).toBe(1)

  // The DM starts the fight: the screen switches to the board without a touch.
  const fight = t.startFight()
  await expect(board(page)).toBeVisible()
  await expect(page.getByText('Der nächste Kampf beginnt gleich')).toHaveCount(0)
  await expect(page.getByTestId('connection-indicator')).toHaveAttribute('data-status', 'connected')
  // It only watches: a move by someone else slides in, and a tap on the hero opens no card.
  const hero = fight.tokens.find((token) => token.label === 'Held')!
  hub.move(t.player.id, hero.id, 1, 5)
  await tapCell(page, 1, 5)
  await expect(page.getByRole('region', { name: 'Figurenkarte' })).toHaveCount(0)
  expect(unhandled).toEqual([])

  // The fight ends: back to waiting.
  fight.status = 'ended'
  spectators.announceEnd(fight)
  await expect(page.getByText('Der nächste Kampf beginnt gleich')).toBeVisible()
  await expect(board(page)).toHaveCount(0)

  // The session ends: the notice, and the screen lets go.
  t.session.status = 'ended'
  spectators.announceSessionEnd(t.session)
  await expect(page.getByText('Sitzung beendet', { exact: true })).toBeVisible()
})

test('a screen opened during a fight shows it at once, and the corner menu fits the map and leaves', async ({
  page,
}) => {
  const t = table()
  t.startFight()
  backend.signIn(page.context(), t.guest)
  await page.goto(`/beitreten/${JOIN_CODE}?sitzung=${t.session.id}`)
  await page.getByRole('button', { name: 'Nur zuschauen' }).click()
  await expect(board(page)).toBeVisible()

  await menu(page).click()
  await expect(page.getByRole('menuitem', { name: 'Ganze Karte' })).toBeVisible()
  await page.getByRole('menuitem', { name: 'Ganze Karte' }).click()

  // A session spectator goes back to the join page, where "Mitspielen" is still offered.
  await menu(page).click()
  await page.getByRole('menuitem', { name: 'Zuschaueransicht verlassen' }).click()
  await expect(page).toHaveURL(new RegExp(`/beitreten/${JOIN_CODE}\\?sitzung=${t.session.id}$`))
  await expect(page.getByRole('button', { name: 'Mitspielen' })).toBeVisible()

  // Left means left: the app does not bring the screen back.
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Deine Kampagnen' })).toBeVisible()
})

test('a typed join code leads to the same choice, with the running session picked', async ({
  page,
}) => {
  const t = table()
  // A later, planned session: the running one is the default.
  backend.addSession(t.campaign, t.dm, 'planned').title = 'Sitzung 2'
  backend.signIn(page.context(), t.guest)
  await page.goto('/')

  await page.getByLabel('Beitrittscode').fill(JOIN_CODE.toLowerCase())
  await page.getByRole('button', { name: 'Zuschauen …' }).click()

  await expect(page).toHaveURL(new RegExp(`/beitreten/${JOIN_CODE}$`))
  await expect(page.getByRole('radio', { name: /Sitzung 1/ })).toBeChecked()
  await expect(page.getByRole('radio', { name: /Sitzung 2/ })).not.toBeChecked()
  await page.getByRole('button', { name: 'Nur zuschauen' }).click()
  await expect(screen(page)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Sitzung 1' })).toBeVisible()
})

test('"Mitspielen" on the join page makes the account a member and opens the campaign', async ({
  page,
}) => {
  const t = table()
  backend.signIn(page.context(), t.guest)
  await page.goto(`/beitreten/${JOIN_CODE}?sitzung=${t.session.id}`)
  await page.getByRole('button', { name: 'Mitspielen' }).click()

  await expect(page).toHaveURL(new RegExp(`/kampagnen/${t.campaign.id}$`))
  expect(t.campaign.members.some((m) => m.userId === t.guest.id)).toBe(true)
})

test('a wrong code says so and goes home', async ({ page }) => {
  const t = table()
  backend.signIn(page.context(), t.guest)
  await page.goto('/beitreten/ZZZZZZ')
  await expect(
    page.getByRole('heading', { name: /Diesen Beitrittscode gibt es nicht/ }),
  ).toBeVisible()
  await page.getByRole('link', { name: 'Zur Startseite' }).click()
  await expect(page.getByRole('heading', { name: 'Deine Kampagnen' })).toBeVisible()
})

test('a member opens the session as spectator screen and leaves to the session page', async ({
  page,
}) => {
  const t = table()
  backend.signIn(page.context(), t.player)
  await page.goto(`/kampagnen/${t.campaign.id}/sitzungen/${t.session.id}`)

  await page.getByRole('link', { name: 'Als Zuschauer öffnen' }).click()
  await expect(screen(page)).toBeVisible()
  await expect(page.getByText('Der nächste Kampf beginnt gleich')).toBeVisible()
  // The device is now this session's screen: the same account on the same device comes back to it.
  t.startFight()
  await expect(board(page)).toBeVisible()
  // Mira's own character isn't drawn on top and she counts once: a spectator only watches.
  await expect(page.getByRole('region', { name: 'Figurenkarte' })).toHaveCount(0)

  await menu(page).click()
  await page.getByRole('menuitem', { name: 'Zuschaueransicht verlassen' }).click()
  await expect(page).toHaveURL(new RegExp(`/kampagnen/${t.campaign.id}/sitzungen/${t.session.id}$`))
})

test('reopening the app on a device that is a screen brings the screen back', async ({ page }) => {
  const t = table()
  backend.signIn(page.context(), t.player)
  await page.goto(`/kampagnen/${t.campaign.id}/sitzungen/${t.session.id}/zuschauen`)
  await expect(screen(page)).toBeVisible()

  // A new tab of the app starts at the landing page and is taken back to the screen.
  const reopened = await page.context().newPage()
  await reopened.goto('/')
  await expect(reopened).toHaveURL(
    new RegExp(`/kampagnen/${t.campaign.id}/sitzungen/${t.session.id}/zuschauen$`),
  )
})
