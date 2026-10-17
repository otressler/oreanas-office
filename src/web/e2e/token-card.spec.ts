// Stage 9: the token card (knowledge/features/token-card.md) against the mocked backend and
// hub, at phone and laptop sizes: a tap on a goblin opens its card without covering the
// goblin, and a stack lists its tokens, where the player's own row selects their character.
import { expect, test, type Page } from '@playwright/test'
import { MockBackend, sampleMap } from './mockBackend.ts'
import { MockHub } from './mockHub.ts'
import { cellCentre, tapCell, text } from './support.ts'

// Mirrors src/text/de.ts (tokenCard).
const card = {
  label: 'Figurenkarte',
  creature: 'Kreatur',
  addStatus: 'Status hinzufügen',
  remove: 'Vom Feld nehmen',
  selectRow: (label: string) => `${label} auswählen`,
  viewRow: (label: string) => `${label} ansehen`,
  stack: (count: number) => `${count} Figuren auf diesem Feld`,
  fold: 'Karte einklappen',
  close: 'Karte schließen',
}

let backend: MockBackend

test.beforeEach(async ({ context }) => {
  backend = new MockBackend()
  await backend.attach(context)
  await new MockHub(backend).attach(context)
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

async function openFight(page: Page, setup: ReturnType<typeof fight>) {
  backend.signIn(page.context(), setup.player)
  await page.goto(`/kampagnen/${setup.campaign.id}/kampf/${setup.encounter.id}`)
  await expect(page.locator('[data-board-surface] canvas').first()).toBeVisible()
  await expect(page.getByTestId('connection-indicator')).toHaveAttribute('data-status', 'connected')
}

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/token-card/${test.info().project.name}-${name}.png` })

test('a tap on a goblin opens its card without covering the goblin', async ({ page, isMobile }) => {
  const setup = fight()
  await openFight(page, setup)
  const goblin = setup.token('Goblin 1')

  await tapCell(page, goblin.x, goblin.y)
  const shown = page.getByRole('region', { name: card.label })
  await expect(shown.getByRole('heading', { name: 'Goblin 1' })).toBeVisible()
  await expect(shown.getByText(card.creature)).toBeVisible()
  await expect(shown.getByRole('button', { name: card.addStatus })).toBeEnabled()
  await expect(shown.getByRole('button', { name: card.remove })).toHaveCount(0)
  // A player can't move the goblin: nothing is selected.
  await expect(page.getByText(text.pickTarget('Goblin 1'))).toHaveCount(0)
  await shot(page, 'goblin')

  const box = (await shown.boundingBox())!
  const surface = (await page.locator('[data-board-surface]').boundingBox())!
  if (isMobile) {
    // Docked along the bottom, at most about a quarter of the screen high.
    expect(box.y + box.height).toBeCloseTo(surface.y + surface.height, 0)
    expect(box.height).toBeLessThanOrEqual(page.viewportSize()!.height * 0.26)
  } else {
    // In the board's top-right corner.
    expect(box.x + box.width).toBeGreaterThan(surface.x + surface.width - 20)
    expect(box.y).toBeLessThan(surface.y + 20)
  }
  const centre = await cellCentre(page, goblin.x, goblin.y)
  const covered =
    centre.x >= box.x &&
    centre.x <= box.x + box.width &&
    centre.y >= box.y &&
    centre.y <= box.y + box.height
  expect(covered).toBe(false)

  // The next tap on an empty cell closes it.
  await tapCell(page, 5, 5)
  await expect(shown).toHaveCount(0)
})

test('a stack lists its tokens, and the player’s own row selects their character', async ({
  page,
}) => {
  const setup = fight()
  const goblin = setup.token('Goblin 1')
  // Mira's character stands on the goblin's cell.
  backend.moveToken(setup.player.id, { tokenId: setup.token('Held').id, x: goblin.x, y: goblin.y })
  await openFight(page, setup)

  await tapCell(page, goblin.x, goblin.y)
  const shown = page.getByRole('region', { name: card.label })
  const rows = shown.getByRole('list', { name: card.stack(2) })
  await expect(rows.getByRole('button')).toHaveCount(2)
  await expect(rows.getByRole('button').nth(0)).toHaveAccessibleName(card.selectRow('Held'))
  await expect(rows.getByRole('button').nth(1)).toHaveAccessibleName(card.viewRow('Goblin 1'))
  // The tap selects the player's own token, as before.
  await expect(shown.getByText(text.pickTarget('Held'))).toBeVisible()
  await shot(page, 'stack')

  // The goblin's row shows its details; letting go and picking Held's row selects it again.
  await rows.getByRole('button', { name: card.viewRow('Goblin 1') }).click()
  await expect(shown.getByRole('heading', { name: 'Goblin 1' })).toBeVisible()
  await shown.getByRole('button', { name: 'Abbrechen' }).click()
  await expect(shown.getByText(text.pickTarget('Held'))).toHaveCount(0)
  await rows.getByRole('button', { name: card.selectRow('Held') }).click()
  await expect(shown.getByText(text.pickTarget('Held'))).toBeVisible()

  // And it moves from there.
  await tapCell(page, goblin.x - 1, goblin.y)
  await page.getByRole('button', { name: text.confirmMove }).click()
  await expect
    .poll(() => [setup.token('Held').x, setup.token('Held').y])
    .toEqual([goblin.x - 1, goblin.y])
})

test('the card folds to one line and closes with ✕', async ({ page }) => {
  const setup = fight()
  await openFight(page, setup)
  const goblin = setup.token('Goblin 1')

  await tapCell(page, goblin.x, goblin.y)
  const shown = page.getByRole('region', { name: card.label })
  await shown.getByRole('button', { name: card.fold }).click()
  await expect(shown.getByText(card.creature)).toHaveCount(0)
  await expect(shown.getByRole('heading', { name: 'Goblin 1' })).toBeVisible()
  await shown.getByRole('button', { name: card.close }).click()
  await expect(shown).toHaveCount(0)
})
