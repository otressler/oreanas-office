// The session DM's initiative list (knowledge/features/initiative.md) against the mock backend
// and hub (mockInitiative.ts): rolling with the setup screen, dragging an entry to another
// place, selecting a token from the list, keeping the list over a reload, and ending it. The
// player's device never shows any of it.
import { expect, test, type Locator, type Page } from '@playwright/test'
import { fogFight, openDevice } from './fogSupport.ts'
import { mockRoll } from './mockInitiative.ts'

// Mirrors src/text/de.ts, de.initiative.
const t = {
  roll: 'Initiative würfeln',
  show: 'Initiative',
  save: 'Übernehmen',
  edit: 'Bearbeiten',
  end: 'Beenden',
  endConfirm: 'Ja, beenden',
  valueOf: (label: string) => `Initiative von ${label}`,
  handle: (label: string) => `${label} verschieben`,
  select: (label: string, value: number | null) =>
    value === null
      ? `${label} auswählen, ohne Initiative`
      : `${label} auswählen, Initiative ${value}`,
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/initiative/${test.info().project.name}-${name}.png` })

/** The list's rows by their accessible names, top to bottom. */
const rows = (list: Locator) =>
  list
    .getByRole('button', { name: /auswählen/ })
    .evaluateAll((buttons) => buttons.map((button) => button.getAttribute('aria-label')))

/** Drags one row's handle onto another row's top edge. */
async function dragOnto(page: Page, handle: Locator, target: Locator) {
  const from = (await handle.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(to.x + to.width / 2, to.y + 2, { steps: 10 })
  await page.mouse.up()
}

test('the DM rolls initiative, drags an entry, selects from the list and ends it', async ({
  browser,
}) => {
  const fight = fogFight({ fog: false })
  const creatures = fight.encounter.tokens.filter((token) => token.kind === 'creature')
  const value = (index: number) => [creatures[index]!.label, mockRoll(index)] as const
  // openDevice makes its own context: the phone project's size has to be given.
  const viewport = test.info().project.name === 'phone' ? { width: 412, height: 839 } : undefined
  const dm = await openDevice(browser, fight, fight.dm, { viewport })
  const player = await openDevice(browser, fight, fight.player)
  await expect(player.getByRole('button', { name: t.roll })).toHaveCount(0)

  await dm.getByRole('button', { name: t.roll }).click()
  const dialog = dm.getByRole('dialog', { name: t.roll })
  await expect(
    dialog.getByRole('spinbutton', { name: t.valueOf(creatures[1]!.label) }),
  ).toHaveValue(String(mockRoll(1)))
  await dialog.getByRole('spinbutton', { name: t.valueOf('Held') }).fill('12')
  // Disadvantage on the creature that rolled a 1: a second d20, and the 1 still counts.
  const lowest = creatures[2]!.label
  await dialog.getByRole('combobox', { name: `Wurfart für ${lowest}` }).selectOption('disadvantage')
  await expect(
    dialog.getByTestId(`setup-${creatures[2]!.id}`).getByTestId('rolls').locator('span'),
  ).toHaveCount(2)
  await expect(dialog.getByRole('spinbutton', { name: t.valueOf(lowest) })).toHaveValue('1')
  await shot(dm, 'setup')
  await dialog.getByRole('button', { name: t.save }).click()
  await expect(dialog).toHaveCount(0)

  // Highest first: the d20s are 7, 14, 1 and 8, Held said 12.
  const list = dm.getByTestId('initiative-list')
  const sorted = [value(1), ['Held', 12] as const, value(3), value(0), value(2)]
  await expect.poll(() => rows(list)).toEqual(sorted.map(([label, v]) => t.select(label, v)))
  await shot(dm, 'list')

  // The last one dragged to the top.
  const [lastLabel] = value(2)
  await dragOnto(
    dm,
    list.getByRole('button', { name: t.handle(lastLabel) }),
    list.getByRole('button', { name: t.handle(sorted[0]![0]) }),
  )
  await expect.poll(() => fight.hub.callsOf('SetInitiative').length).toBe(2)
  await expect
    .poll(() => rows(list))
    .toEqual([value(2), ...sorted.slice(0, 4)].map(([label, v]) => t.select(label, v)))

  // A tap on an entry selects its token and opens its card.
  await list.getByRole('button', { name: t.select('Held', 12) }).click()
  await expect(
    dm.getByRole('region', { name: 'Figurenkarte' }).getByRole('heading', { name: 'Held' }),
  ).toBeVisible()
  await shot(dm, 'selected')

  // It stays with the fight over a reload, and never reaches the player.
  await dm.reload()
  await expect.poll(() => rows(dm.getByTestId('initiative-list'))).toHaveLength(5)
  await expect(player.getByTestId('initiative-list')).toHaveCount(0)
  expect(
    fight.hub.calls.filter(
      (call) => call.context === player.context() && call.method.includes('Initiative'),
    ),
  ).toEqual([])

  await dm.getByTestId('initiative-list').getByRole('button', { name: t.end }).click()
  await dm.getByTestId('initiative-list').getByRole('button', { name: t.endConfirm }).click()
  await expect(dm.getByTestId('initiative-list')).toHaveCount(0)
  await expect(dm.getByRole('button', { name: t.roll })).toBeVisible()
})
