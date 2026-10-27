// A player takes their character from another campaign into this one, portrait included
// (knowledge/features/character-import.md).
import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'
import { MockBackend } from './mockBackend.ts'

test('a player takes their character from another campaign, with its portrait', async ({
  page,
  context,
}) => {
  const backend = new MockBackend()
  const oreana = backend.addUser({ displayName: 'Oreana', email: 'oreana@example.org' })
  const mira = backend.addUser({ displayName: 'Mira', email: 'mira@example.org' })
  const here = backend.addCampaign('Die Rabenküste', oreana)
  const there = backend.addCampaign('Der Fluch von Barovia', oreana)
  backend.addMember(here, mira)
  backend.addMember(there, mira)
  const thorin = backend.addCharacter(there, mira, 'Thorin', {
    size: 'small',
    species: 'Zwerg',
    characterClass: 'Kämpfer',
    tagline: 'Hat immer Hunger.',
    appearance: 'Roter Bart',
  })
  backend.imageBytes = readFileSync(new URL('../public/pwa-192x192.png', import.meta.url))
  backend.addTokenImage(there, 'character', thorin.id)
  backend.signIn(context, mira)
  await backend.attach(context)

  await page.goto('/')
  await page.getByRole('link', { name: /Die Rabenküste/ }).first().click()
  await page.getByRole('link', { name: /Charakter übernehmen/ }).click()

  const barovia = page.getByRole('region', { name: 'Der Fluch von Barovia' })
  await expect(barovia.getByText('Hat immer Hunger.')).toBeVisible()
  await expect(barovia.getByRole('img', { name: 'Porträt: Thorin' })).toBeVisible()
  await barovia.getByRole('button', { name: 'Thorin übernehmen' }).click()

  // The copy's page, with the texts and its own copy of the portrait.
  await expect(page.getByRole('heading', { name: 'Thorin', level: 1 })).toBeVisible()
  await expect(page.getByText('Roter Bart')).toBeVisible()
  await expect(page.getByRole('img', { name: 'Porträt: Thorin' })).toBeVisible()
  const copies = backend.characters.filter((c) => c.name === 'Thorin')
  expect(copies.map((c) => c.campaignId).sort()).toEqual([here.id, there.id].sort())

  // Back on the campaign page the copy is there; Thorin's source stays where it was.
  await page.getByRole('link', { name: /Die Rabenküste/ }).first().click()
  await expect(page.getByRole('link', { name: 'Thorin ansehen' })).toBeVisible()
})
