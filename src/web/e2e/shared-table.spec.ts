// The shared table (knowledge/features/shared-table.md) against the mock backend and the fake
// hub: the row of avatars along the top of the board ("Who's here") and the session DM's
// play mode switch on the session page. The shared screen itself needs the spectator board,
// which the mock doesn't have; Vitest covers its controls and the backend tests its rules.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { MockBackend, sampleMap } from './mockBackend.ts'
import { MockHub } from './mockHub.ts'

let backend: MockBackend
let hub: MockHub

test.beforeEach(() => {
  backend = new MockBackend()
  hub = new MockHub(backend)
})

/** The gorge crossing running with Mira's "Held" and Jonas, who has no character in it. */
function fight() {
  const dm = backend.addUser({ displayName: 'Oreana', email: 'oreana@example.org' })
  const mira = backend.addUser({ displayName: 'Mira', email: 'mira@example.org' })
  const jonas = backend.addUser({ displayName: 'Jonas', email: 'jonas@example.org' })
  const campaign = backend.addCampaign('Die Rabenküste', dm)
  backend.addMember(campaign, mira)
  backend.addMember(campaign, jonas)
  const session = backend.addSession(campaign, dm)
  const hero = backend.addCharacter(campaign, mira, 'Held')
  const encounter = backend.addEncounter(campaign, sampleMap('gorge-crossing'), {
    session,
    characters: [{ characterId: hero.id, x: 0, y: 5 }],
  })
  encounter.presence = {
    people: [
      { userId: dm.id, connected: true, isSessionDm: true },
      { userId: mira.id, connected: true, isSessionDm: false },
      { userId: jonas.id, connected: true, isSessionDm: false },
    ],
    sharedScreen: false,
  }
  return { dm, mira, jonas, campaign, session, encounter }
}

type Setup = ReturnType<typeof fight>

async function signedIn(
  browser: Browser,
  user: Setup['dm'],
  context?: BrowserContext,
): Promise<Page> {
  const ctx = context ?? (await browser.newContext())
  await backend.attach(ctx)
  await hub.attach(ctx)
  backend.signIn(ctx, user)
  return ctx.newPage()
}

async function onBoard(page: Page, setup: Setup) {
  await page.goto(`/kampagnen/${setup.campaign.id}/kampf/${setup.encounter.id}`)
  await expect(page.locator('[data-board-surface] canvas').first()).toBeVisible()
  await expect(page.getByTestId('connection-indicator')).toHaveAttribute('data-status', 'connected')
}

const row = (page: Page) => page.getByRole('group', { name: 'Wer am Tisch ist' })

test('the row shows everyone in the fight and greys out whoever drops out', async ({
  page,
  browser,
}) => {
  const setup = fight()
  const mira = await signedIn(browser, setup.mira, page.context())
  await onBoard(mira, setup)

  await expect(row(mira).getByRole('button')).toHaveCount(3)
  await expect(mira.getByRole('button', { name: 'Oreana, verbunden' })).toHaveAttribute(
    'data-connected',
    'true',
  )
  await expect(mira.getByRole('button', { name: 'Jonas, verbunden' })).toBeVisible()
  await expect(mira.getByRole('button', { name: 'Mira, verbunden' })).toBeVisible()

  // Jonas' phone goes to the background: his avatar greys out for everyone, and comes back.
  hub.presenceChanged(setup.encounter.id, {
    ...setup.encounter.presence!,
    people: setup.encounter.presence!.people.map((p) =>
      p.userId === setup.jonas.id ? { ...p, connected: false } : p,
    ),
  })
  const jonas = mira.getByRole('button', { name: 'Jonas, nicht verbunden' })
  await expect(jonas).toHaveAttribute('data-connected', 'false')
  await expect(row(mira).getByRole('button')).toHaveCount(3)

  hub.presenceChanged(setup.encounter.id, {
    ...setup.encounter.presence!,
    people: setup.encounter.presence!.people.map((p) => ({ ...p, connected: true })),
  })
  await expect(mira.getByRole('button', { name: 'Jonas, verbunden' })).toHaveAttribute(
    'data-connected',
    'true',
  )
})

test('a tap names the person, and the shared screen appears as a table', async ({
  page,
  browser,
}) => {
  const setup = fight()
  const dm = await signedIn(browser, setup.dm, page.context())
  await onBoard(dm, setup)

  await dm.getByRole('button', { name: 'Jonas, verbunden' }).click()
  const note = dm.getByRole('status').filter({ hasText: 'Jonas' })
  await expect(note).toContainText('verbunden')
  // Tapping elsewhere closes it again.
  await dm.locator('[data-board-surface]').click({ position: { x: 5, y: 5 } })
  await expect(note).toHaveCount(0)

  // A tablet opens the shared screen: the table icon joins the row, once.
  hub.presenceChanged(setup.encounter.id, { ...setup.encounter.presence!, sharedScreen: true })
  await expect(dm.getByRole('button', { name: 'Tisch, verbunden' })).toHaveAttribute(
    'data-kind',
    'table',
  )
  await expect(row(dm).getByRole('button')).toHaveCount(4)

  hub.presenceChanged(setup.encounter.id, { ...setup.encounter.presence!, sharedScreen: false })
  await expect(row(dm).getByRole('button')).toHaveCount(3)
})

test('the session DM switches the play mode, everyone else sees it and can open the screen', async ({
  page,
  browser,
}) => {
  const setup = fight()
  const sessionUrl = `/kampagnen/${setup.campaign.id}/sitzungen/${setup.session.id}`
  const dm = await signedIn(browser, setup.dm, page.context())
  const player = await signedIn(browser, setup.mira)
  await dm.goto(sessionUrl)
  await player.goto(sessionUrl)

  const modes = dm.getByRole('group', { name: 'Spielweise' })
  const byod = modes.getByRole('button', { name: 'Eigene Geräte' })
  const local = modes.getByRole('button', { name: 'Gemeinsamer Bildschirm' })
  const open = (p: Page) => p.getByRole('link', { name: 'Gemeinsamen Bildschirm öffnen' })

  // The default: own devices, no shared screen to open, and the player can't change the mode.
  await expect(byod).toHaveAttribute('aria-pressed', 'true')
  await expect(open(dm)).toHaveCount(0)
  await expect(player.getByText('Spielweise: Eigene Geräte')).toBeVisible()
  await expect(player.getByRole('group', { name: 'Spielweise' })).toHaveCount(0)

  // Local mode: the DM's switch moves, and any member is offered the shared screen.
  await local.click()
  await expect(local).toHaveAttribute('aria-pressed', 'true')
  await expect(open(dm)).toBeVisible()
  expect(setup.session.playMode).toBe('local')
  await player.reload()
  await expect(player.getByText('Spielweise: Gemeinsamer Bildschirm')).toBeVisible()
  await expect(open(player)).toHaveAttribute('href', `${sessionUrl}/zuschauen?gemeinsam=1`)

  // Switching back takes the link away again.
  await byod.click()
  await expect(byod).toHaveAttribute('aria-pressed', 'true')
  await expect(open(dm)).toHaveCount(0)
  await player.reload()
  await expect(open(player)).toHaveCount(0)
})
