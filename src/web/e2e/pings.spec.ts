// Stage 9's pings, arrows and player extras against the fake hub (mockHub.ts): a player
// and the DM on the same running fight, each in their own browser context. Pings and
// arrows reach the other device, a quick double tap never moves a token, off-screen
// markers pan there, "Meine Figur" centres the player's character, and a confirmed move
// vibrates once.
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { MockBackend, sampleMap } from './mockBackend.ts'
import { MockHub } from './mockHub.ts'
import { cellCentre, doubleTapCell, tapCell, text } from './support.ts'

const hint = 'Doppeltippen: zeigen · Doppeltippen und ziehen: Pfeil'

let backend: MockBackend
let hub: MockHub

test.beforeEach(() => {
  backend = new MockBackend()
  hub = new MockHub(backend)
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

type Setup = ReturnType<typeof fight>

/** A device signed in as `user`, on the running fight, connected. */
async function device(
  browser: Browser,
  setup: Setup,
  user: Setup['dm'],
  context?: BrowserContext,
): Promise<Page> {
  const ctx = context ?? (await browser.newContext())
  await backend.attach(ctx)
  await hub.attach(ctx)
  backend.signIn(ctx, user)
  const page = await ctx.newPage()
  await page.goto(`/kampagnen/${setup.campaign.id}/kampf/${setup.encounter.id}`)
  await expect(page.locator('[data-board-surface] canvas').first()).toBeVisible()
  await expect(page.getByTestId('connection-indicator')).toHaveAttribute('data-status', 'connected')
  return page
}

/** The pings a device announces (the board's live region). */
const pings = (page: Page) => page.getByTestId('board-pings').locator('[data-ping]')

/** The board's transform: CSS pixels per world unit and the offset. */
const stage = (page: Page) =>
  page.evaluate(() => {
    const s = (
      window as unknown as { Konva: { stages: { x(): number; y(): number; scaleX(): number }[] } }
    ).Konva.stages.at(-1)!
    return { x: s.x(), y: s.y(), scale: s.scaleX() }
  })

/** Zooms the board in around its middle with the mouse wheel. */
async function zoomIn(page: Page, steps = 6) {
  const box = (await page.locator('[data-board-surface]').boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  for (let i = 0; i < steps; i++) await page.mouse.wheel(0, -300)
}

test('a double tap pings a cell for the others, and the hint goes', async ({ page, browser }) => {
  const setup = fight()
  const mira = await device(browser, setup, setup.player, page.context())
  const oreana = await device(browser, setup, setup.dm)
  await expect(mira.getByText(hint)).toBeVisible()

  await doubleTapCell(mira, 5, 5)
  await expect.poll(() => hub.callsOf('Ping')).toHaveLength(1)
  expect(hub.callsOf('Ping')[0]).toEqual([
    expect.objectContaining({ cell: { x: 5, y: 5 }, tokenId: null }),
  ])
  // Shown at once on the own device, and on the other one.
  await expect(pings(mira)).toHaveAttribute('data-cell', '5,5')
  await expect(pings(oreana)).toHaveAttribute('data-ping', 'cell')
  await expect(pings(oreana)).toHaveAttribute('data-cell', '5,5')
  await expect(pings(oreana)).toHaveAttribute('data-user', setup.player.id)
  await expect(mira.getByText(hint)).toHaveCount(0)
  await mira.screenshot({ path: `test-results/pings/${test.info().project.name}-ping.png` })

  // Gone after about three seconds; the hint stays gone after a reload.
  await expect(pings(oreana)).toHaveCount(0, { timeout: 5_000 })
  await mira.reload()
  await expect(mira.locator('[data-board-surface] canvas').first()).toBeVisible()
  await expect(mira.getByText(hint)).toHaveCount(0)
})

test('a double tap on a token pings the token', async ({ page, browser }) => {
  const setup = fight()
  const mira = await device(browser, setup, setup.player, page.context())
  const oreana = await device(browser, setup, setup.dm)
  const goblin = setup.token('Goblin 1')

  await doubleTapCell(mira, goblin.x, goblin.y)
  await expect(pings(oreana)).toHaveAttribute('data-token', goblin.id)
  await expect(pings(oreana)).toHaveText('Mira zeigt auf Goblin 1')
})

test('double tap and drag draws an arrow for the others', async ({ page, browser }) => {
  const setup = fight()
  const oreana = await device(browser, setup, setup.dm, page.context())
  const mira = await device(browser, setup, setup.player)

  const from = await cellCentre(oreana, 2, 5)
  const to = await cellCentre(oreana, 6, 4)
  await oreana.mouse.click(from.x, from.y)
  await oreana.mouse.move(from.x, from.y)
  await oreana.mouse.down()
  await oreana.mouse.move(to.x, to.y, { steps: 8 })
  // Nothing is sent while drawing, and the view didn't pan.
  expect(hub.callsOf('DrawArrow')).toHaveLength(0)
  await oreana.mouse.up()

  await expect.poll(() => hub.callsOf('DrawArrow')).toHaveLength(1)
  expect(hub.callsOf('DrawArrow')[0]).toEqual([
    expect.objectContaining({ fromCell: { x: 2, y: 5 }, fromTokenId: null, to: { x: 6, y: 4 } }),
  ])
  await expect(pings(mira)).toHaveAttribute('data-ping', 'arrow')
  await expect(pings(mira)).toHaveAttribute('data-cell', '6,4')
  await expect(pings(mira)).toHaveText('Oreana zeigt einen Weg')
  await oreana.screenshot({ path: `test-results/pings/${test.info().project.name}-arrow.png` })
})

test('a quick double tap while a token is selected pings and never moves it', async ({ page }) => {
  const setup = fight()
  const mira = await device(page.context().browser()!, setup, setup.player, page.context())

  await tapCell(mira, 0, 5)
  await expect(mira.getByText(text.pickTarget('Held'))).toBeVisible()
  // The first tap would preview the move; the second takes it back and pings.
  await doubleTapCell(mira, 2, 5)
  await expect.poll(() => hub.callsOf('Ping')).toHaveLength(1)
  await expect(mira.getByText(text.confirmHint('Held'))).toHaveCount(0)
  await expect(mira.getByText(text.pickTarget('Held'))).toBeVisible()
  // The preview never reached the others: it is sent only after it stood for 300 ms.
  await mira.waitForTimeout(500)
  expect(hub.callsOf('PreviewMove')).toHaveLength(0)
  expect(hub.callsOf('MoveToken')).toHaveLength(0)
  expect([setup.token('Held').x, setup.token('Held').y]).toEqual([0, 5])
})

test('a ping out of view gets a marker at the edge that pans there', async ({ page, browser }) => {
  const setup = fight()
  const mira = await device(browser, setup, setup.player, page.context())
  const oreana = await device(browser, setup, setup.dm)
  await zoomIn(mira)
  // Far east, beyond the gorge; Mira looks at the middle of the map.
  const before = await stage(mira)

  await doubleTapCell(oreana, 19, 1)
  await expect(pings(mira)).toHaveAttribute('data-cell', '19,1')
  const marker = mira.getByRole('button', { name: 'Zur Markierung von Oreana' })
  await expect(marker).toBeVisible()
  await mira.screenshot({ path: `test-results/pings/${test.info().project.name}-marker.png` })

  await marker.click()
  const after = await stage(mira)
  expect(after.scale).toBeCloseTo(before.scale)
  expect(after.x).toBeLessThan(before.x)
  await expect(marker).toBeHidden()
})

test('"Meine Figur" centres the player’s character without selecting it', async ({ page }) => {
  const setup = fight()
  const mira = await device(page.context().browser()!, setup, setup.player, page.context())
  await zoomIn(mira)
  const box = (await mira.locator('[data-board-surface]').boundingBox())!

  await mira.getByRole('button', { name: 'Meine Figur' }).click()
  const hero = await cellCentre(mira, 0, 5)
  // The board can't pan the map's edge past the middle, so "near" the middle.
  expect(Math.abs(hero.y - (box.y + box.height / 2))).toBeLessThan(40)
  expect(hero.x).toBeLessThan(box.x + box.width / 2 + 40)
  await expect(mira.getByText(text.pickTarget('Held'))).toHaveCount(0)
  expect(hub.callsOf('MoveToken')).toHaveLength(0)
})

test('a confirmed move vibrates once, a refused one twice', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as { vibrations: unknown[] }
    w.vibrations = []
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      value: (pattern: unknown) => {
        w.vibrations.push(pattern)
        return true
      },
    })
  })
  const setup = fight()
  const mira = await device(page.context().browser()!, setup, setup.player, page.context())
  const vibrations = () =>
    mira.evaluate(() => (window as unknown as { vibrations: unknown[] }).vibrations)

  await tapCell(mira, 0, 5)
  await tapCell(mira, 2, 5)
  await tapCell(mira, 2, 5)
  await expect.poll(() => [setup.token('Held').x, setup.token('Held').y]).toEqual([2, 5])
  await expect.poll(vibrations).toEqual([30])

  hub.refuseMoves = 'notYourToken'
  await tapCell(mira, 2, 5)
  await tapCell(mira, 3, 5)
  await tapCell(mira, 3, 5)
  await expect(mira.getByRole('alert')).toHaveText(text.notYourToken)
  await expect.poll(vibrations).toEqual([30, [30, 80, 30]])
})

test('the profile page has the "Vibrieren" switch where the device can vibrate', async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => true })
  })
  await backend.attach(context)
  const user = backend.addUser({ displayName: 'Mira', email: 'mira@example.org' })
  backend.signIn(context, user)
  await page.goto('/profil')
  const toggle = page.getByRole('switch', { name: 'Kurz vibrieren, wenn ein Zug angekommen ist' })
  await expect(toggle).toBeChecked()
  await toggle.uncheck()
  await page.reload()
  await expect(toggle).not.toBeChecked()
})
