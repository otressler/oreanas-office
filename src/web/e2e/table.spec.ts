// Stage 4's live table against a fake hub (mockHub.ts) at phone and laptop sizes: tap
// to select, preview and confirm, the rollback of a refused move, a move by someone
// else sliding in, undo, and the connection indicator with moving switched off.
// The real hub and two-device sync run in table.backend.spec.ts.
import { expect, test, type Page } from '@playwright/test'
import { MockBackend, sampleMap } from './mockBackend.ts'
import { MockHub } from './mockHub.ts'
import { mockHealth, tapCell, text } from './support.ts'

let backend: MockBackend
let hub: MockHub

test.beforeEach(async ({ context }) => {
  backend = new MockBackend()
  hub = new MockHub(backend)
  await backend.attach(context)
  await hub.attach(context)
})

/** The gorge crossing running, with Mira's "Held" at (0, 5) west of the gorge. */
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

const indicator = (page: Page) => page.getByTestId('connection-indicator')

async function openFight(page: Page, setup: ReturnType<typeof fight>) {
  backend.signIn(page.context(), setup.player)
  await page.goto(`/kampagnen/${setup.campaign.id}/kampf/${setup.encounter.id}`)
  await expect(page.locator('[data-board-surface] canvas').first()).toBeVisible()
  await expect(indicator(page)).toHaveAttribute('data-status', 'connected')
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/table/${test.info().project.name}-${name}.png` })

/** Counts redraws of the board's token layer from now on. */
async function countTokenDraws(page: Page) {
  await page.evaluate(() => {
    const w = window as any
    const layer = w.Konva.stages[0].getLayers()[1]
    const draw = layer.batchDraw.bind(layer)
    w.tokenDraws = 0
    layer.batchDraw = () => {
      w.tokenDraws += 1
      return draw()
    }
  })
  return () => page.evaluate(() => (window as any).tokenDraws as number)
}

test('a player selects, previews and confirms a move, then undoes it', async ({ page }) => {
  const setup = fight()
  await openFight(page, setup)
  const hero = setup.token('Held')

  await tapCell(page, 0, 5)
  await expect(page.getByText(text.pickTarget('Held'))).toBeVisible()

  // Into the gorge: not a place to stand.
  await tapCell(page, 9, 3)
  await expect(page.getByText(text.invalidTarget)).toBeVisible()
  await expect(page.getByText(text.pickTarget('Held'))).toBeVisible()

  // Onto the bridge: a preview first, nothing sent.
  await tapCell(page, 9, 5)
  await expect(page.getByText(text.confirmHint('Held'))).toBeVisible()
  await shot(page, 'preview')
  expect(hub.callsOf('MoveToken')).toHaveLength(0)

  await tapCell(page, 9, 5)
  await expect.poll(() => [hero.x, hero.y]).toEqual([9, 5])
  expect(hub.callsOf('MoveToken')).toEqual([[{ tokenId: hero.id, x: 9, y: 5 }]])
  await expect(page.getByText(text.confirmHint('Held'))).toHaveCount(0)

  await page.getByRole('button', { name: text.undo }).click()
  await expect.poll(() => [hero.x, hero.y]).toEqual([0, 5])
  await expect(page.getByRole('button', { name: text.undo })).toHaveCount(0)
})

test('the "Hierhin" button confirms a preview', async ({ page }) => {
  const setup = fight()
  await openFight(page, setup)

  await tapCell(page, 0, 5)
  await tapCell(page, 2, 6)
  await page.getByRole('button', { name: text.confirmMove }).click()
  await expect.poll(() => [setup.token('Held').x, setup.token('Held').y]).toEqual([2, 6])
})

test('a refused move goes back with the German message', async ({ page }) => {
  const setup = fight()
  hub.refuseMoves = 'notYourToken'
  await openFight(page, setup)

  await tapCell(page, 0, 5)
  await tapCell(page, 3, 5)
  await tapCell(page, 3, 5)
  await expect(page.getByRole('alert')).toHaveText(text.notYourToken)
  await shot(page, 'refused')

  // Back on its cell: tapping there selects it again.
  await tapCell(page, 0, 5)
  await expect(page.getByText(text.pickTarget('Held'))).toBeVisible()
  await expect(page.getByRole('button', { name: text.undo })).toHaveCount(0)
})

test('a move by someone else slides in', async ({ page }) => {
  const setup = fight()
  await openFight(page, setup)
  const draws = await countTokenDraws(page)

  hub.move(setup.dm.id, setup.token('Goblin 1').id, 13, 4)
  // About 200 ms of animation frames redraw the token layer alone.
  await expect.poll(draws).toBeGreaterThanOrEqual(5)

  await tapCell(page, 13, 4)
  await expect(page.getByRole('status')).toContainText('Goblin 1')
})

test('with reduced motion a move by someone else jumps', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const setup = fight()
  await openFight(page, setup)
  const draws = await countTokenDraws(page)

  hub.move(setup.dm.id, setup.token('Goblin 1').id, 13, 4)
  await tapCell(page, 13, 4)
  await expect(page.getByRole('status')).toContainText('Goblin 1')
  expect(await draws()).toBeLessThanOrEqual(3)
})

test('the indicator shows a lost connection and moving is off until it is back', async ({
  page,
}) => {
  const setup = fight()
  await openFight(page, setup)

  hub.dropAll()
  await expect(indicator(page)).toHaveText(text.reconnecting)
  await shot(page, 'reconnecting')

  await tapCell(page, 0, 5)
  await expect(page.getByText(text.movingOff)).toBeVisible()
  await expect(page.getByText(text.pickTarget('Held'))).toHaveCount(0)
  // The server answers its health check, so no waking screen.
  await expect(page.getByText(text.wakingTitle)).toHaveCount(0)

  hub.down = false
  await expect(indicator(page)).toHaveAttribute('data-status', 'connected', { timeout: 15_000 })
  await tapCell(page, 0, 5)
  await expect(page.getByText(text.pickTarget('Held'))).toBeVisible()
})

test('after the idle timeout a tap brings the table back', async ({ page, context }) => {
  const setup = fight()
  await openFight(page, setup)

  hub.idleTimeout(context)
  await expect(indicator(page)).toHaveText(text.idle)
  expect(hub.joined(context)).toBe(0)

  await tapCell(page, 5, 5)
  await expect(indicator(page)).toHaveAttribute('data-status', 'connected')
  expect(hub.joined(context)).toBe(1)
})

test('a reconnect during a cold start shows the waking screen, then the board', async ({
  page,
  context,
}) => {
  const setup = fight()
  await openFight(page, setup)

  // The server went to sleep; while it starts, health says "waking".
  const health = await mockHealth(context, 'waking')
  hub.dropAll()
  await expect(page.getByText(text.wakingTitle)).toBeVisible()

  // Meanwhile someone moved the goblin; the board comes back with it.
  hub.down = false
  backend.moveToken(setup.dm.id, { tokenId: setup.token('Goblin 1').id, x: 13, y: 4 })
  health.set('ok')
  await expect(indicator(page)).toHaveAttribute('data-status', 'connected', { timeout: 15_000 })
  await tapCell(page, 13, 4)
  await expect(page.getByRole('status')).toContainText('Goblin 1')
})
