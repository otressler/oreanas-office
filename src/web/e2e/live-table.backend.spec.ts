// Runs against the real backend (`npm run test:e2e:backend`): the stage 4 gate on two
// devices. Oreana runs the fight on the gorge crossing and Mira plays Ilse. A move shows
// up live on the other device, Mira can't take the goblin, undo works until someone
// else moves the token, a device that was offline catches up when it reconnects, and
// tokens may share a cell.
import { expect, test, type Page } from '@playwright/test'
import { ilse, indicator, position, startFight } from './backendFight.ts'
import { tapCell, text } from './support.ts'

/** Select the token on (x, y), then tap the target twice: preview and confirm. */
async function move(page: Page, from: [number, number], to: [number, number], name: string) {
  await tapCell(page, ...from)
  await expect(page.getByText(text.pickTarget(name))).toBeVisible()
  await tapCell(page, ...to)
  await expect(page.getByText(text.confirmHint(name))).toBeVisible()
  await tapCell(page, ...to)
  await expect(page.getByText(text.confirmHint(name))).toHaveCount(0)
}

/**
 * The device sees Ilse on (x, y): tapping that cell selects her. Taps again while the
 * board is still catching up (a slide, or the reload after a reconnect). Escape lets go.
 */
async function seesIlseAt(page: Page, x: number, y: number) {
  await expect(async () => {
    await page.keyboard.press('Escape')
    await tapCell(page, x, y)
    await expect(page.getByText(text.pickTarget('Ilse'))).toBeVisible({ timeout: 1_000 })
  }).toPass({ timeout: 10_000 })
  await page.keyboard.press('Escape')
  await expect(page.getByText(text.pickTarget('Ilse'))).toHaveCount(0)
}

test('players and the DM move tokens live on both devices', async ({ browser, page }) => {
  // Two devices through registration, setup and a dozen moves: longer than the default.
  test.setTimeout(120_000)
  const { oreana, mira } = await startFight(browser, page)
  expect(await ilse(mira)).toEqual({ x: 0, y: 5 })

  // Mira can't take the goblin: tapping it only shows what it is.
  await tapCell(mira, 14, 4)
  await expect(mira.getByText('Goblin 1')).toBeVisible()
  await expect(mira.getByText(text.pickTarget('Goblin 1'))).toHaveCount(0)

  // The gorge is refused; the bridge isn't. Oreana sees Ilse there without reloading.
  await tapCell(mira, 0, 5)
  await tapCell(mira, 9, 2)
  await expect(mira.getByText(text.invalidTarget)).toBeVisible()
  await mira.keyboard.press('Escape')
  await move(mira, [0, 5], [9, 5], 'Ilse')
  await expect.poll(() => ilse(mira)).toEqual({ x: 9, y: 5 })
  await seesIlseAt(oreana, 9, 5)

  // Mira takes it back; Oreana sees her back on the forest path.
  await mira.getByRole('button', { name: text.undo }).click()
  await expect(mira.getByRole('button', { name: text.undo })).toHaveCount(0)
  await expect.poll(() => ilse(mira)).toEqual({ x: 0, y: 5 })
  await seesIlseAt(oreana, 0, 5)

  // Once the DM moves Ilse after her, Mira's undo is gone.
  await move(mira, [0, 5], [2, 8], 'Ilse')
  await expect(mira.getByRole('button', { name: text.undo })).toBeVisible()
  await move(oreana, [2, 8], [3, 9], 'Ilse')
  await expect(mira.getByRole('button', { name: text.undo })).toHaveCount(0)
  await seesIlseAt(mira, 3, 9)

  // Mira's phone loses the connection: moving is off. The DM moves Ilse meanwhile;
  // once Mira is back, her board shows where Ilse is now.
  await mira.context().setOffline(true)
  await expect(indicator(mira)).not.toHaveAttribute('data-status', 'connected')
  await move(oreana, [3, 9], [5, 10], 'Ilse')
  await mira.context().setOffline(false)
  await expect(indicator(mira)).toHaveAttribute('data-status', 'connected', { timeout: 30_000 })
  await seesIlseAt(mira, 5, 10)

  // Tokens may share a cell: the DM puts the goblin onto Ilse.
  await move(oreana, [14, 4], [5, 10], 'Goblin 1')
  await expect.poll(() => position(oreana, 'Goblin 1')).toEqual({ x: 5, y: 10 })
})
