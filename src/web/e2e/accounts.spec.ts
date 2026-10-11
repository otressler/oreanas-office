import { expect, test } from '@playwright/test'
import { MockBackend } from './mockBackend.ts'
import { signInWithForm, text } from './support.ts'

let backend: MockBackend

test.beforeEach(async ({ context }) => {
  backend = new MockBackend()
  await backend.attach(context)
})

test('signs in with email and password and returns to the page asked for', async ({ page }) => {
  const mira = backend.addUser({ displayName: 'Mira', email: 'mira@example.org' })
  const campaign = backend.addCampaign('Der Fluch von Strahd', mira)

  await page.goto(`/kampagnen/${campaign.id}`)
  await expect(page.getByRole('heading', { name: text.signInTitle })).toBeVisible()
  await expect(page).toHaveURL(/\/anmelden\?zurueck=/)

  await signInWithForm(page, 'mira@example.org', 'falsch!!')
  await expect(page.getByRole('alert')).toHaveText(text.invalidCredentials)

  await signInWithForm(page, 'mira@example.org', 'geheim123')
  await expect(page.getByRole('heading', { name: 'Der Fluch von Strahd' })).toBeVisible()
  await expect(page).toHaveURL(`/kampagnen/${campaign.id}`)
  await expect(page.getByRole('link', { name: text.profileLink('Mira') })).toBeVisible()
})

test('registers a new account through an invite link', async ({ page }) => {
  const invite = backend.addInvite()

  await page.goto(`/einladung/${invite.token}`)
  await expect(page.getByRole('heading', { name: text.registerTitle })).toBeVisible()
  await page.getByLabel(text.displayName).fill('Brom')
  await page.getByLabel(text.email).fill('brom@example.org')
  await page.getByLabel(text.password, { exact: true }).fill('zwergenbart')
  await page.getByRole('button', { name: text.registerButton }).click()

  await expect(page.getByRole('heading', { name: text.homeTitle })).toBeVisible()
  await expect(page).toHaveURL('/')
  await expect(page.getByRole('link', { name: text.profileLink('Brom') })).toBeVisible()
  expect(backend.users.map((u) => u.email)).toContain('brom@example.org')
})

test('an expired invite link asks for a new one', async ({ page }) => {
  const invite = backend.addInvite({ expired: true })

  await page.goto(`/einladung/${invite.token}`)
  await expect(page.getByRole('heading', { name: text.inviteExpiredTitle })).toBeVisible()
  await expect(page.getByLabel(text.email)).toHaveCount(0)
})
