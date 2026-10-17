// Stage 10's fog of war at the table (knowledge/features/fog-of-war.md) against the mock
// backend and hub (mockFog.ts), the DM and a player each on their own device: the DM
// reveals an area behind a confirm step and a creature from its card, the player's fog
// fades away, hidden cells say "Unerkundet", and nothing hidden is in the player's traffic.
import { expect, test, type Page } from '@playwright/test'
import {
  ambushCells,
  fogAlpha,
  fogFight,
  fogText as t,
  openDevice,
  sampleFogAlpha,
} from './fogSupport.ts'
import { fogCall } from './mockFog.ts'
import { tapCell, text } from './support.ts'

const card = (page: Page) => page.getByRole('region', { name: t.cardLabel })
const cellCard = (page: Page) => page.getByRole('region', { name: t.cellLabel, exact: true })
/** The confirm bar's "Aufdecken", not the direction segment of the same name. */
const confirm = (page: Page) =>
  page.getByTestId('fog-bar').locator('button:not([aria-pressed])', { hasText: t.reveal })
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/fog/${test.info().project.name}-${name}.png` })

test('the DM reveals an area after the confirm step, then a creature from its card', async ({
  browser,
}) => {
  const fight = fogFight()
  const dm = await openDevice(browser, fight, fight.dm)
  const player = await openDevice(browser, fight, fight.player)

  // The DM's own view: the fog is hatched, the map shows through.
  await expect.poll(() => fogAlpha(dm, 14, 5)).toBeGreaterThan(0)
  expect(await fogAlpha(dm, 14, 5)).toBeLessThan(255)
  expect(await fogAlpha(player, 14, 5)).toBe(255)
  await shot(dm, 'dm-hatched')
  await shot(player, 'player-fog')

  // Fog mode: tap into the "Hinterhalt" area; nothing reaches the player before "Aufdecken".
  await dm.getByRole('button', { name: t.fogButton, exact: true }).click()
  await dm.getByRole('button', { name: t.tools.area }).click()
  await tapCell(dm, 14, 5)
  await expect(dm.getByText(t.confirmReveal(ambushCells().length))).toBeVisible()
  await shot(dm, 'dm-confirm')
  expect(fight.hub.callsOf('ChangeFog')).toEqual([])
  await tapCell(player, 14, 5)
  await expect(player.getByText(t.unexplored)).toBeVisible()
  await tapCell(player, 14, 5)

  // Cancel drops it.
  await dm.getByRole('button', { name: t.cancel }).click()
  await expect(dm.getByText(t.confirmReveal(ambushCells().length))).toHaveCount(0)
  expect(fight.hub.callsOf('ChangeFog')).toEqual([])

  // Again, and confirm.
  await tapCell(dm, 14, 5)
  await confirm(dm).click()
  await expect.poll(() => fight.hub.callsOf('ChangeFog').length).toBe(1)
  expect(fight.hub.callsOf('ChangeFog')[0]![0]).toMatchObject({ reveal: true })
  await expect(dm.getByTestId('undo-change')).toContainText(t.revealed(ambushCells().length))

  // The player's fog fades away over the area; the two goblins stay hidden creatures.
  await expect.poll(() => fogAlpha(player, 14, 5)).toBe(0)
  expect(await fogAlpha(player, 12, 5)).toBe(255)
  await tapCell(player, 14, 5)
  await expect(cellCard(player)).toBeVisible()
  await expect(player.getByText(t.unexplored)).toHaveCount(0)
  await tapCell(player, 14, 4)
  await expect(cellCard(player)).toBeVisible()
  await expect(card(player)).toHaveCount(0)

  // "Rückgängig" puts the fog back on both devices.
  await dm.getByTestId('undo-change').getByRole('button', { name: t.undo }).click()
  await expect.poll(() => fight.hub.callsOf('UndoChange').length).toBe(1)
  await expect.poll(() => fogAlpha(player, 14, 5)).toBe(255)

  // Reveal the area again, leave fog mode and reveal the goblins from their cards.
  await tapCell(dm, 14, 5)
  await confirm(dm).click()
  await expect.poll(() => fogAlpha(player, 14, 5)).toBe(0)
  await dm.getByRole('button', { name: t.fogButton, exact: true }).click()

  await tapCell(dm, 14, 4)
  await expect(card(dm)).toContainText('Goblin')
  await expect(card(dm).getByText('Verborgen: Nur du siehst diese Kreatur.')).toBeVisible()
  // Both ambushing goblins stand in the same area: one tap reveals them together.
  await card(dm)
    .getByRole('button', { name: `${t.revealAllHere} (2)` })
    .click()
  await expect.poll(() => fight.hub.callsOf('SetTokensHidden').length).toBe(1)
  expect(fight.hub.callsOf('SetTokensHidden')[0]![0]).toMatchObject({ hidden: false })

  // The player sees them numbered at first sight, in the order they were placed.
  await tapCell(player, 14, 4)
  await expect(card(player).getByRole('heading', { name: 'Goblin 1' })).toBeVisible()
  await shot(player, 'player-goblin')
  await tapCell(player, 14, 7)
  await expect(card(player).getByRole('heading', { name: 'Goblin 2' })).toBeVisible()

  // The DM hides one again from its card: it disappears for the player but keeps its number.
  await card(dm).getByRole('button', { name: 'Karte schließen' }).click()
  await tapCell(dm, 14, 7)
  await card(dm).getByRole('button', { name: t.tokenHide }).click()
  await expect.poll(() => fight.hub.callsOf('SetTokensHidden').length).toBe(2)
  // The player's open card for it closes by itself; a tap there finds nothing but ground.
  await expect(card(player)).toHaveCount(0)
  await tapCell(player, 14, 7)
  await expect(card(player)).toHaveCount(0)
})

test('the player sees fog, "Unerkundet", a fade and no hidden data on the wire', async ({
  browser,
}) => {
  const fight = fogFight()
  const bodies: string[] = []
  const context = await browser.newContext({ locale: 'de-DE' })
  context.on('response', async (response) => {
    if (response.url().includes('/board')) bodies.push(await response.text())
  })
  const player = await openDevice(browser, fight, fight.player, { context })

  // Fog is opaque over the east; the west is open map.
  expect(await fogAlpha(player, 15, 5)).toBe(255)
  expect(await fogAlpha(player, 3, 5)).toBe(0)

  // Tapping fog says "Unerkundet": no terrain, no height.
  await tapCell(player, 15, 5)
  await expect(player.getByText(t.unexplored)).toBeVisible()
  await expect(player.getByText(/Höhe/)).toHaveCount(0)
  await tapCell(player, 15, 5)

  // A character can't be moved into the fog.
  await tapCell(player, 0, 5)
  await expect(player.getByText(text.pickTarget('Held'))).toBeVisible()
  await tapCell(player, 13, 2)
  await expect(player.getByText(text.invalidTarget)).toBeVisible()
  await player.keyboard.press('Escape')

  // Nothing hidden in the board the server sent: no goblin, no ogre, no hidden layout.
  const wire = bodies.join('\n')
  expect(wire.length).toBeGreaterThan(0)
  expect(wire).not.toMatch(/Goblin|Oger/)
  const board = JSON.parse(bodies.at(-1)!) as {
    tokens: { label: string }[]
    map: { layout: { cells: { x: number }[] } }
    fog: { hiddenCells: unknown[] }
  }
  expect(board.tokens.map((token) => token.label)).toEqual(['Held'])
  expect(board.map.layout.cells.every((cell) => cell.x < 12)).toBe(true)
  expect(board.fog.hiddenCells).toHaveLength(8 * 12)

  // The DM reveals a cell block on the server: the fog fades over about half a second.
  const samples = await sampleFogAlpha(player, 14, 5, 1800, async () => {
    await player.waitForTimeout(300)
    fogCall(fight.backend, fight.hub, fight.dm.id, 'ChangeFog', [
      {
        encounterId: fight.encounter.id,
        reveal: true,
        cells: ambushCells().map(([x, y]) => ({ x, y })),
      },
    ])
  })
  expect(samples[0]).toBe(255)
  expect(samples.at(-1)).toBe(0)
  expect(samples.some((alpha) => alpha > 20 && alpha < 235)).toBe(true)
  // It only ever gets lighter while fading away.
  for (let i = 1; i < samples.length; i++) expect(samples[i]!).toBeLessThanOrEqual(samples[i - 1]!)
  await shot(player, 'player-revealed')

  // And the revealed cells now come with their layout.
  await tapCell(player, 14, 5)
  await expect(cellCard(player)).toBeVisible()
  await expect(player.getByText(t.unexplored)).toHaveCount(0)
})

test('"Spieleransicht" shows the DM exactly what the player sees and sends nothing', async ({
  browser,
}) => {
  const fight = fogFight()
  const dm = await openDevice(browser, fight, fight.dm)
  await dm.getByRole('switch', { name: t.playerView }).check()
  await expect(dm.getByText(t.playerViewNote)).toBeVisible()
  await expect.poll(() => fogAlpha(dm, 14, 5)).toBe(255)
  await tapCell(dm, 14, 5)
  await expect(dm.getByText(t.unexplored)).toBeVisible()
  await shot(dm, 'dm-player-view')
  expect(fight.hub.callsOf('ChangeFog')).toEqual([])
  await dm.getByRole('switch', { name: t.playerView }).uncheck()
  await expect.poll(() => fogAlpha(dm, 14, 5)).toBeLessThan(255)
})
