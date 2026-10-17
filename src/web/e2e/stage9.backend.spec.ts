// Runs against the real backend (`npm run test:e2e:backend`): stage 9 on two devices
// (knowledge/implementation-plan.md, stage 9, step 3). Mira plays Ilse, Oreana runs the
// fight. A ping and an arrow reach the other device, a status Mira puts on the goblin
// shows for Oreana after a reload, a quick double tap on a preview doesn't move Ilse,
// "Meine Figur" centres her, a confirmed move vibrates once, and Oreana takes the goblin
// off the board and brings it back.
import { expect, test, type Page } from '@playwright/test'
import { position, startFight } from './backendFight.ts'
import { cellCentre, doubleTapCell, tapCell, text } from './support.ts'

/** The pings a device announces (the board's live region). */
const pings = (page: Page) => page.getByTestId('board-pings').locator('[data-ping]')
const card = (page: Page) => page.getByRole('region', { name: 'Figurenkarte' })
const statuses = (page: Page) => card(page).getByRole('region', { name: 'Zustände' })

test('pings, statuses, removing tokens and the player extras on two devices', async ({
  browser,
  page,
}) => {
  test.setTimeout(150_000)
  await page.context().addInitScript(() => {
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
  const { oreana, mira } = await startFight(browser, page)
  const vibrations = () =>
    mira.evaluate(() => (window as unknown as { vibrations?: unknown[] }).vibrations ?? [])

  // A ping on a cell reaches Oreana in Mira's colour; the DM's arrow reaches Mira.
  await doubleTapCell(mira, 4, 7)
  await expect(pings(oreana)).toHaveAttribute('data-cell', '4,7')
  await expect(pings(oreana)).toHaveText(/^Mira zeigt auf ein Feld$/)
  const from = await cellCentre(oreana, 2, 5)
  const to = await cellCentre(oreana, 6, 4)
  await oreana.mouse.click(from.x, from.y)
  await oreana.mouse.down()
  await oreana.mouse.move(to.x, to.y, { steps: 8 })
  await oreana.mouse.up()
  await expect(pings(mira).and(mira.locator('[data-ping="arrow"]'))).toHaveAttribute(
    'data-cell',
    '6,4',
  )

  // A quick double tap on Ilse's preview pings instead of moving her.
  await tapCell(mira, 0, 5)
  await tapCell(mira, 2, 8)
  await expect(mira.getByText(text.confirmHint('Ilse'))).toBeVisible()
  await doubleTapCell(mira, 2, 8)
  await mira.waitForTimeout(800)
  expect(await position(mira, 'Ilse')).toEqual({ x: 0, y: 5 })
  expect(await vibrations()).toEqual([])

  // Confirming for real moves her, and the phone vibrates once.
  await tapCell(mira, 2, 8)
  await expect(mira.getByText(text.confirmHint('Ilse'))).toHaveCount(0)
  await expect.poll(() => position(mira, 'Ilse')).toEqual({ x: 2, y: 8 })
  await expect.poll(vibrations).toEqual([30])

  // Mira puts "Liegend" on the goblin; Oreana sees it with its author, also after a reload.
  await tapCell(mira, 14, 4)
  await card(mira).getByRole('button', { name: 'Status hinzufügen' }).click()
  const picker = mira.getByRole('dialog', { name: 'Zustand für Goblin 1' })
  await picker.getByRole('button', { name: 'Liegend setzen' }).click()
  await picker.getByRole('button', { name: 'Fertig' }).click()
  await expect(statuses(mira)).toContainText('Liegend')
  await oreana.reload()
  await expect(oreana.getByTestId('connection-indicator')).toHaveAttribute(
    'data-status',
    'connected',
  )
  await tapCell(oreana, 14, 4)
  await expect(statuses(oreana)).toContainText('Liegend')
  await expect(statuses(oreana)).toContainText('von Mira')
  await oreana.keyboard.press('Escape')

  // "Meine Figur" centres Ilse without selecting her.
  await mira.keyboard.press('Escape')
  await mira.getByRole('button', { name: 'Meine Figur' }).click()
  const box = (await mira.locator('[data-board-surface]').boundingBox())!
  const ilse = await cellCentre(mira, 2, 8)
  expect(Math.abs(ilse.y - (box.y + box.height / 2))).toBeLessThan(box.height / 4)
  await expect(mira.getByText(text.pickTarget('Ilse'))).toHaveCount(0)

  // Oreana takes the goblin off the board: it's gone for Mira; "Rückgängig" brings it back.
  await tapCell(oreana, 14, 4)
  await card(oreana).getByRole('button', { name: 'Vom Feld nehmen' }).click()
  await expect(oreana.getByText('Goblin 1 vom Feld genommen')).toBeVisible()
  await expect
    .poll(async () => (await position(mira, 'Goblin 1').catch(() => null)) ?? 'gone')
    .toBe('gone')
  await oreana.getByRole('button', { name: text.undo }).click()
  await expect.poll(() => position(mira, 'Goblin 1')).toEqual({ x: 14, y: 4 })
  await tapCell(mira, 14, 4)
  await expect(card(mira)).toContainText('Goblin 1')
  await expect(card(mira).getByRole('button', { name: 'Vom Feld nehmen' })).toHaveCount(0)
})
