// Stage 3 gate checks for the board on screen, at phone and laptop sizes: the plain
// rendering, tap info, zoom and fit, and the 40×40 performance case. Screenshots
// land in test-results/board/ for a person to look at; nothing compares pixels.
import { expect, test, type Page } from '@playwright/test'
import { MockBackend, sampleMap } from './mockBackend.ts'
import { MockHub } from './mockHub.ts'
import { cellCentre, tapCell } from './support.ts'

let backend: MockBackend

test.beforeEach(async ({ context }) => {
  backend = new MockBackend()
  await backend.attach(context)
  await new MockHub(backend).attach(context)
})

/** A running fight on a sample map, seen by a player with characters on the board. */
function fight(mapId: string, placements: (index: number) => { x: number; y: number }[]) {
  const dm = backend.addUser({ displayName: 'Oreana', email: 'oreana@example.org' })
  const player = backend.addUser({ displayName: 'Mira', email: 'mira@example.org' })
  const campaign = backend.addCampaign('Die Rabenküste', dm)
  backend.addMember(campaign, player)
  const session = backend.addSession(campaign, dm)
  const spots = placements(0)
  const characters = spots.map((_, i) => backend.addCharacter(campaign, player, `Held ${i + 1}`))
  const encounter = backend.addEncounter(campaign, sampleMap(mapId), {
    session,
    characters: spots.map((spot, i) => ({ characterId: characters[i]!.id, ...spot })),
  })
  return { player, campaign, encounter }
}

async function openFight(page: Page, setup: ReturnType<typeof fight>) {
  backend.signIn(page.context(), setup.player)
  await page.goto(`/kampagnen/${setup.campaign.id}/kampf/${setup.encounter.id}`)
  await expect(page.locator('[data-board-surface] canvas').first()).toBeVisible()
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/board/${test.info().project.name}-${name}.png` })

test('the gorge crossing shows terrain, the bridge and tokens, and taps tell elevation', async ({
  page,
}) => {
  await openFight(
    page,
    fight('gorge-crossing', () => [
      { x: 0, y: 5 },
      { x: 1, y: 6 },
    ]),
  )
  await shot(page, 'gorge-fit')

  // The menhir: a blocking feature on ground at 0 m.
  await tapCell(page, 3, 2)
  const info = page.getByRole('status')
  await expect(info).toContainText('Menhir')
  await expect(info).toContainText('Höhe 0 m')

  // The ogre is Large and covers 2×2 from (16, 5): its lower right cell finds it too.
  await tapCell(page, 17, 6)
  await expect(info).toContainText('Oger 1')
  await expect(info).toContainText('Groß')
  await shot(page, 'gorge-tap-ogre')
})

test('the crypt shows elevation in German number format', async ({ page }) => {
  await openFight(
    page,
    fight('crypt', () => [{ x: 11, y: 14 }]),
  )
  await shot(page, 'crypt-fit')

  // The altar dais at 1.5 m, beside the altar.
  await tapCell(page, 11, 11)
  await expect(page.getByRole('status')).toContainText('Höhe 1,5 m')
})

test('zooming in keeps the board on screen and "Ganze Karte" fits it again', async ({ page }) => {
  await openFight(
    page,
    fight('river-ford', () => [{ x: 0, y: 5 }]),
  )
  const fitted = await page.evaluate(() => (window as any).Konva.stages[0].scaleX() as number)

  const ford = await cellCentre(page, 17, 5)
  await page.mouse.move(ford.x, ford.y)
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -200)
  await expect
    .poll(() => page.evaluate(() => (window as any).Konva.stages[0].scaleX() as number))
    .toBeGreaterThan(fitted * 2)
  await shot(page, 'river-zoomed')

  // The page itself never scrolls or zooms with the board.
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0])

  await page.getByRole('button', { name: 'Ganze Karte' }).click()
  await expect
    .poll(() => page.evaluate(() => (window as any).Konva.stages[0].scaleX() as number))
    .toBeCloseTo(fitted, 5)
})

test('the 40×38 field with a crowd draws fast enough for a phone', async ({ page }) => {
  // 16 characters plus the five creatures in the file.
  const crowd = Array.from({ length: 16 }, (_, i) => ({
    x: 2 + (i % 8),
    y: 15 + Math.floor(i / 8) * 4,
  }))
  await openFight(
    page,
    fight('open-field', () => crowd),
  )
  await shot(page, 'field-fit')

  // A mid-range phone: Chromium's CPU throttled four times.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  const zoomedOut = await drawTimes(page)
  const centre = await cellCentre(page, 20, 19)
  await page.mouse.move(centre.x, centre.y)
  for (let i = 0; i < 8; i++) await page.mouse.wheel(0, -200)
  const zoomedIn = await drawTimes(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 })

  test.info().annotations.push({
    type: 'draw time (ms, median at 4× throttling)',
    description: `fitted ${zoomedOut.toFixed(1)}, zoomed in ${zoomedIn.toFixed(1)}`,
  })
  // One frame at 60 Hz is 16.7 ms; a full redraw must fit well inside it.
  expect(zoomedOut).toBeLessThan(8)
  expect(zoomedIn).toBeLessThan(8)
})

/** The median time of 30 full redraws of the board's layers (map and tokens). */
async function drawTimes(page: Page) {
  return page.evaluate(() => {
    const stage = (window as any).Konva.stages[0]
    const times: number[] = []
    for (let i = 0; i < 30; i++) {
      const start = performance.now()
      stage.draw()
      times.push(performance.now() - start)
    }
    times.sort((a, b) => a - b)
    return times[15]!
  })
}
