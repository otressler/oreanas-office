// Stage 9: statuses and removing tokens against the mocked backend and hub, with a player
// and the session DM in two browser contexts (knowledge/features/statuses.md,
// removing-tokens.md): a player puts "Liegend" on a goblin and the DM sees it, also after a
// reload; the player can't take off the DM's status; the DM takes a token off the board,
// "Rückgängig" brings it back, and so does "Zurückholen"; a player makes "Verhext" and
// generates its icon after confirming.
import { expect, test, type BrowserContext, type Page } from '@playwright/test'
import { MockBackend, sampleMap } from './mockBackend.ts'
import { MockHub, MockImageHub } from './mockHub.ts'
import { tapCell } from './support.ts'

// Mirrors src/text/de.ts (tokenCard, statuses).
const t = {
  card: 'Figurenkarte',
  cell: 'Feld',
  statuses: 'Zustände',
  addStatus: 'Status hinzufügen',
  pickerTitle: (label: string) => `Zustand für ${label}`,
  set: (name: string) => `${name} setzen`,
  done: 'Fertig',
  remove: 'Vom Feld nehmen',
  removed: (label: string) => `${label} vom Feld genommen`,
  undo: 'Rückgängig',
  removedList: (count: number) => `Vom Feld genommen (${count})`,
  restoreRow: (label: string) => `${label} zurückholen`,
  statusList: (name: string) => `Zustandsliste von ${name}`,
  customOpen: 'Eigener Zustand',
  customName: 'Name',
  customDescription: 'Was das Symbol zeigen soll',
  create: 'Anlegen',
  icon: (name: string) => `Symbol von ${name}`,
  generate: 'Symbol erzeugen',
  confirmTitle: 'Symbol erzeugen?',
  confirm: 'Erzeugen',
  picked: 'Ausgewählt',
}

let backend: MockBackend
let hub: MockHub

test.beforeEach(async ({ context }) => {
  backend = new MockBackend()
  hub = new MockHub(backend)
  await backend.attach(context)
  await hub.attach(context)
})

function fight() {
  const dm = backend.addUser({ displayName: 'Oreana', email: 'oreana@example.org' })
  const player = backend.addUser({ displayName: 'Mira', email: 'mira@example.org' })
  const campaign = backend.addCampaign('Die Rabenküste', dm)
  backend.addMember(campaign, player)
  const session = backend.addSession(campaign, dm)
  const hero = backend.addCharacter(campaign, player, 'Held')
  const encounter = backend.addEncounter(campaign, sampleMap('gorge-crossing'), {
    session,
    characters: [{ characterId: hero.id, x: 0, y: 5 }],
  })
  const token = (label: string) => encounter.tokens.find((t) => t.label === label)!
  return { dm, player, campaign, encounter, token }
}

type Setup = ReturnType<typeof fight>

async function openFight(page: Page, setup: Setup, user: Setup['dm']) {
  backend.signIn(page.context(), user)
  await page.goto(`/kampagnen/${setup.campaign.id}/kampf/${setup.encounter.id}`)
  await expect(page.locator('[data-board-surface] canvas').first()).toBeVisible()
  await expect(page.getByTestId('connection-indicator')).toHaveAttribute('data-status', 'connected')
}

/** A second browser context for the DM, on the same mocks. */
async function dmContext(newContext: () => Promise<BrowserContext>) {
  const context = await newContext()
  await backend.attach(context)
  await hub.attach(context)
  return context
}

const card = (page: Page) => page.getByRole('region', { name: t.card })

test('a player puts "Liegend" on a goblin and the DM sees it, also after a reload', async ({
  page,
  browser,
  baseURL,
}) => {
  const setup = fight()
  const goblin = setup.token('Goblin 1')
  await openFight(page, setup, setup.player)
  const dmPage = await (
    await dmContext(() => browser.newContext({ baseURL, locale: 'de-DE' }))
  ).newPage()
  await openFight(dmPage, setup, setup.dm)

  await tapCell(page, goblin.x, goblin.y)
  await card(page).getByRole('button', { name: t.addStatus }).click()
  const picker = page.getByRole('dialog', { name: t.pickerTitle('Goblin 1') })
  await picker.getByRole('button', { name: t.set('Liegend') }).click()
  await expect(picker.getByRole('button', { name: 'Liegend entfernen' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await picker.getByRole('button', { name: t.done }).click()
  await expect(card(page).getByRole('region', { name: t.statuses })).toContainText('Liegend')
  expect(hub.callsOf('AddStatus')).toHaveLength(1)

  await tapCell(dmPage, goblin.x, goblin.y)
  const dmStatuses = card(dmPage).getByRole('region', { name: t.statuses })
  await expect(dmStatuses).toContainText('Liegend')
  await expect(dmStatuses).toContainText('von Mira')

  await dmPage.reload()
  await expect(dmPage.getByTestId('connection-indicator')).toHaveAttribute(
    'data-status',
    'connected',
  )
  await tapCell(dmPage, goblin.x, goblin.y)
  await expect(card(dmPage).getByRole('region', { name: t.statuses })).toContainText('Liegend')
  await dmPage.context().close()
})

test('a player can’t take off the DM’s status, only their own', async ({ page }) => {
  const setup = fight()
  const goblin = setup.token('Goblin 1')
  backend.putStatus(goblin, 'poisoned', setup.dm.id)
  backend.putStatus(goblin, 'prone', setup.player.id)
  await openFight(page, setup, setup.player)

  await tapCell(page, goblin.x, goblin.y)
  const statuses = card(page).getByRole('region', { name: t.statuses })
  await expect(statuses).toContainText('Vergiftet')
  await expect(statuses).toContainText('von Oreana')
  await expect(statuses.getByRole('button', { name: /Vergiftet/ })).toHaveCount(0)

  await statuses.getByRole('button', { name: /Liegend/ }).click()
  await card(page).getByRole('button', { name: 'Entfernen' }).click()
  await expect(statuses).not.toContainText('Liegend')
  await expect(statuses).toContainText('Vergiftet')
})

test('the DM takes a token off the board; "Rückgängig" and "Zurückholen" bring it back', async ({
  page,
  browser,
  baseURL,
}) => {
  const setup = fight()
  const goblin = setup.token('Goblin 1')
  await openFight(page, setup, setup.player)
  const dmPage = await (
    await dmContext(() => browser.newContext({ baseURL, locale: 'de-DE' }))
  ).newPage()
  await openFight(dmPage, setup, setup.dm)

  // A player has no button for it.
  await tapCell(page, goblin.x, goblin.y)
  await expect(card(page).getByRole('button', { name: t.remove })).toHaveCount(0)
  await tapCell(page, 5, 5)

  await tapCell(dmPage, goblin.x, goblin.y)
  await card(dmPage).getByRole('button', { name: t.remove }).click()
  const bar = dmPage.getByTestId('undo-remove')
  await expect(bar).toContainText(t.removed('Goblin 1'))
  await expect.poll(() => goblin.removedAt).toBeTruthy()
  await expect(card(dmPage)).toHaveCount(0)

  // Gone for the player: the cell shows its terrain instead of the goblin's card.
  await expect
    .poll(async () => {
      await tapCell(page, goblin.x, goblin.y)
      const field = await page.getByRole('region', { name: t.cell }).count()
      // Close whatever opened, for the next try.
      await page.keyboard.press('Escape')
      return field
    })
    .toBe(1)

  await bar.getByRole('button', { name: t.undo }).click()
  await expect.poll(() => goblin.removedAt).toBeFalsy()
  await expect(bar).toHaveCount(0)
  await tapCell(page, goblin.x, goblin.y)
  await expect(card(page).getByRole('heading', { name: 'Goblin 1' })).toBeVisible()

  // Again, and back from the list this time.
  await tapCell(dmPage, goblin.x, goblin.y)
  await card(dmPage).getByRole('button', { name: t.remove }).click()
  await expect.poll(() => goblin.removedAt).toBeTruthy()
  await dmPage.getByRole('button', { name: t.removedList(1) }).click()
  await dmPage.getByRole('button', { name: t.restoreRow('Goblin 1') }).click()
  await expect.poll(() => goblin.removedAt).toBeFalsy()
  await expect(dmPage.getByRole('button', { name: /^Vom Feld genommen/ })).toHaveCount(0)
  expect(hub.callsOf('RestoreToken')).toHaveLength(2)
  await dmPage.context().close()
})

test('a player makes "Verhext" and generates its icon after confirming', async ({
  page,
  context,
}) => {
  await new MockImageHub(backend).attach(context)
  const setup = fight()
  backend.signIn(context, setup.player)

  await page.goto(`/kampagnen/${setup.campaign.id}`)
  const characters = page.getByRole('region', { name: 'Charaktere' })
  await characters.getByRole('button', { name: t.statusList('Held') }).click()
  const list = characters.getByRole('region', { name: t.statusList('Held') })
  await expect(list.getByText('Liegend')).toBeVisible()

  await list.getByRole('button', { name: t.customOpen }).click()
  await list.getByLabel(t.customName).fill('Verhext')
  await list.getByLabel(t.customDescription).fill('ein lila Auge in einer Hand')
  await list.getByRole('button', { name: t.create }).click()

  const gallery = list.getByRole('region', { name: t.icon('Verhext') })
  await gallery.getByRole('button', { name: t.generate }).click()
  const dialog = page.getByRole('dialog', { name: t.confirmTitle })
  await expect(dialog).toBeVisible()
  expect(backend.tokenImages).toHaveLength(0)
  await dialog.getByRole('button', { name: t.confirm }).click()

  await expect(gallery.getByText(t.picked, { exact: true })).toBeVisible()
  const status = backend.statusDefinitions.find((s) => s.name === 'Verhext')!
  expect(backend.tokenImages.map((i) => i.image)).toEqual([
    expect.objectContaining({ ownerType: 'status', ownerId: status.id, status: 'done' }),
  ])
})
