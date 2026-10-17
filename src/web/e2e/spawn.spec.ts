// Stage 10's creature spawn (knowledge/features/creature-spawn.md) against the mock backend
// and hub (mockFog.ts): the DM picks a type, taps cells, confirms, and undoes; the player's
// device gets nothing before the confirm, and nothing at all for a hidden spawn.
import { expect, test, type Page } from '@playwright/test'
import { fogFight, fogText as t, openDevice } from './fogSupport.ts'
import { tapCell } from './support.ts'

const card = (page: Page) => page.getByRole('region', { name: t.cardLabel })
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/fog/${test.info().project.name}-${name}.png` })

test('the DM spawns two goblins after the confirm step, and undoes it', async ({ browser }) => {
  const fight = fogFight({ fog: false })
  const dm = await openDevice(browser, fight, fight.dm)
  const player = await openDevice(browser, fight, fight.player)

  await dm.getByRole('button', { name: t.spawn.button }).click()
  await dm.getByRole('button', { name: t.spawn.pick('Goblin') }).click()
  await tapCell(dm, 5, 3)
  await tapCell(dm, 6, 3)
  await shot(dm, 'spawn-placing')

  // Placed creatures exist on the DM's device only, until the confirm.
  await dm.getByRole('button', { name: t.spawn.done }).click()
  await expect(dm.getByText(t.spawn.confirm(2))).toBeVisible()
  await shot(dm, 'spawn-confirm')
  expect(fight.hub.callsOf('SpawnCreatures')).toEqual([])
  await tapCell(player, 5, 3)
  await expect(card(player)).toHaveCount(0)

  await dm.getByRole('button', { name: t.spawn.appear }).click()
  await expect.poll(() => fight.hub.callsOf('SpawnCreatures').length).toBe(1)
  expect(fight.hub.callsOf('SpawnCreatures')[0]![0]).toMatchObject({
    hidden: false,
    creatures: [
      { x: 5, y: 3 },
      { x: 6, y: 3 },
    ],
  })

  // They are numbered after the goblins already on the map: Goblin 4 and Goblin 5.
  await tapCell(player, 5, 3)
  await expect(card(player).getByRole('heading', { name: 'Goblin 4' })).toBeVisible()
  await tapCell(player, 6, 3)
  await expect(card(player).getByRole('heading', { name: 'Goblin 5' })).toBeVisible()
  await expect(dm.getByTestId('undo-change')).toContainText(t.spawn.appeared(2))

  // "Rückgängig" takes both off again on every device.
  await dm.getByTestId('undo-change').getByRole('button', { name: t.undo }).click()
  await expect.poll(() => fight.hub.callsOf('UndoChange').length).toBe(1)
  await expect(card(player)).toHaveCount(0)
  await tapCell(player, 5, 3)
  await expect(card(player)).toHaveCount(0)
  await tapCell(dm, 6, 3)
  await expect(card(dm)).toHaveCount(0)
})

test('a hidden spawn stays with the DM until it is revealed', async ({ browser }) => {
  const fight = fogFight({ fog: false })
  const dm = await openDevice(browser, fight, fight.dm)
  const player = await openDevice(browser, fight, fight.player)

  await dm.getByRole('button', { name: t.spawn.button }).click()
  await dm.getByRole('button', { name: t.spawn.pick('Oger') }).click()
  await tapCell(dm, 4, 8)
  await dm.getByRole('button', { name: t.spawn.done }).click()
  await dm.getByRole('switch', { name: t.spawn.hidden }).check()
  await dm.getByRole('button', { name: t.spawn.appear }).click()
  await expect.poll(() => fight.hub.callsOf('SpawnCreatures').length).toBe(1)
  expect(fight.hub.callsOf('SpawnCreatures')[0]![0]).toMatchObject({ hidden: true })

  // The player's device has neither the creature nor a way to tap it.
  await tapCell(player, 4, 8)
  await expect(card(player)).toHaveCount(0)

  // The DM sees it, and a reveal from its card shows it to the player.
  await tapCell(dm, 4, 8)
  await expect(card(dm).getByRole('heading', { name: /Oger/ })).toBeVisible()
  await card(dm).getByRole('button', { name: t.tokenReveal }).click()
  await expect.poll(() => fight.hub.callsOf('SetTokensHidden').length).toBe(1)
  await tapCell(player, 4, 8)
  await expect(card(player).getByRole('heading', { name: /Oger/ })).toBeVisible()
})

test('a player has no "Kreatur hinzufügen"', async ({ browser }) => {
  const fight = fogFight({ fog: false })
  const player = await openDevice(browser, fight, fight.player)
  await expect(player.getByRole('button', { name: t.spawn.button })).toHaveCount(0)
  await expect(player.getByRole('button', { name: t.fogButton, exact: true })).toHaveCount(0)
})
