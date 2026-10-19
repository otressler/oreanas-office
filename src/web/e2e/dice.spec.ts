// The dice tray (knowledge/features/dice-tray.md) at phone and laptop sizes: opened from
// the fight screen's top bar and from the session page, rolled on the device, and still
// holding its dice and last rolls when it opens again. Playwright's locators reach into
// the tray's shadow DOM.
import { expect, test, type Page } from '@playwright/test'
import { MockBackend, sampleMap } from './mockBackend.ts'
import { MockHub } from './mockHub.ts'

const text = {
  open: 'Würfeln',
  title: 'Würfel',
  close: 'Schließen',
  addD20: 'Einen W20 dazunehmen',
  addD6: /Einen W6 dazunehmen/,
  increase: 'Modifikator erhöhen',
  advantage: 'Vorteil',
  roll: (n: number) => `${n} Würfel werfen`,
  rollAgain: 'Noch mal würfeln',
  history: 'Letzte Würfe',
}

let backend: MockBackend

test.beforeEach(async ({ context }) => {
  backend = new MockBackend()
  await backend.attach(context)
  await new MockHub(backend).attach(context)
})

/** The gorge crossing running, with Mira's "Held" on the board. */
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
  return { dm, player, campaign, session, encounter }
}

const dialog = (page: Page) => page.getByRole('dialog', { name: text.title })

const shot = (page: Page, name: string) =>
  page.screenshot({ path: `test-results/dice/${test.info().project.name}-${name}.png` })

test('a player rolls from the fight screen and finds the dice again', async ({ page }) => {
  const setup = fight()
  backend.signIn(page.context(), setup.player)
  await page.goto(`/kampagnen/${setup.campaign.id}/kampf/${setup.encounter.id}`)
  await expect(page.locator('[data-board-surface] canvas').first()).toBeVisible()

  await page.getByRole('button', { name: text.open }).click()
  const tray = dialog(page)
  await expect(tray).toBeVisible()
  await shot(page, 'fight-empty')

  await tray.getByRole('button', { name: text.addD20 }).click()
  await tray.getByRole('button', { name: text.addD6 }).click()
  await tray.getByRole('button', { name: text.increase }).click()
  await tray.getByRole('button', { name: text.advantage }).click()
  await tray.getByRole('button', { name: text.roll(2) }).click()
  await expect(tray.getByRole('button', { name: text.rollAgain, exact: true })).toBeVisible()
  await tray.getByText(text.history).click()
  await expect(tray.getByRole('button', { name: 'W6 + W20 + 1 noch mal würfeln' })).toBeVisible()
  await expect(tray.getByText('mit Vorteil', { exact: true })).toBeVisible()
  await shot(page, 'fight-rolled')

  // Closing keeps the dice; Escape closes like the button.
  await page.keyboard.press('Escape')
  await expect(tray).toBeHidden()
  await page.getByRole('button', { name: text.open }).click()
  await expect(dialog(page).getByRole('button', { name: text.rollAgain, exact: true })).toBeVisible()
})

test('the DM opens the dice tray from the session page', async ({ page }) => {
  const setup = fight()
  backend.signIn(page.context(), setup.dm)
  await page.goto(`/kampagnen/${setup.campaign.id}/sitzungen/${setup.session.id}`)
  await expect(page.getByRole('heading', { name: setup.session.title })).toBeVisible()
  await shot(page, 'session')

  await page.getByRole('button', { name: text.open }).click()
  const tray = dialog(page)
  await tray.getByRole('button', { name: text.addD20 }).click()
  await tray.getByRole('button', { name: text.roll(1) }).click()
  await expect(tray.getByRole('button', { name: text.rollAgain, exact: true })).toBeVisible()
  await shot(page, 'session-rolled')

  await tray.getByRole('button', { name: text.close }).click()
  await expect(tray).toBeHidden()
})
