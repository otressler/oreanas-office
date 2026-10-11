import { expect, type BrowserContext, type Page } from '@playwright/test'

// Text the specs look for; mirrors src/text/de.ts.
export const text = {
  appName: "Oreana's Office",
  signInTitle: 'Anmelden',
  homeTitle: 'Deine Kampagnen',
  notFoundTitle: 'Diese Seite gibt es nicht',
  wakingTitle: 'Der Tisch wird geweckt…',
  offlineTitle: 'Keine Verbindung',
  installButton: 'App installieren',
  email: 'E-Mail-Adresse',
  password: 'Passwort',
  signInButton: 'Anmelden',
  invalidCredentials: 'E-Mail-Adresse oder Passwort stimmen nicht.',
  registerTitle: 'Konto erstellen',
  displayName: 'Anzeigename',
  registerButton: 'Konto erstellen',
  inviteExpiredTitle: 'Link abgelaufen',
  campaignName: 'Name der Kampagne',
  create: 'Anlegen',
  joinCode: 'Beitrittscode',
  joinButton: 'Beitreten',
  joinCodeInvalid:
    'Diesen Code gibt es nicht. Prüf ihn oder frag deine Spielleitung nach dem aktuellen.',
  roleDm: 'Spielleitung',
  rolePlayer: 'Spieler',
  charactersTitle: 'Charaktere',
  newCharacter: 'Neuer Charakter',
  characterName: 'Name',
  speed: 'Geschwindigkeit in Metern',
  sessionsTitle: 'Sitzungen',
  newSession: 'Neue Sitzung',
  sessionTitle: 'Titel',
  activate: 'Starten',
  activeStatus: 'Läuft',
  activeSessionLabel: 'Läuft gerade',
  profileLink: (name: string) => `Profil von ${name}`,
}

type HealthState = 'ok' | 'waking'

/**
 * Answers GET /api/health for the whole browser context (pages and service
 * worker). Returns a setter to change the answer mid-test.
 */
export async function mockHealth(context: BrowserContext, initial: HealthState) {
  let state = initial
  const calls: HealthState[] = []
  await context.route('**/api/health', async (route) => {
    calls.push(state)
    await route.fulfill({
      status: state === 'ok' ? 200 : 503,
      contentType: 'application/json',
      body: JSON.stringify({ status: state }),
    })
  })
  return {
    set(next: HealthState) {
      state = next
    },
    calls,
  }
}

/** The app shell: the header with the app name, shown even while the server sleeps. */
export function shellHeader(page: Page) {
  return page.getByRole('banner').getByRole('link', { name: text.appName })
}

/** Waits until the service worker is active and has precached the app shell. */
export async function waitForServiceWorker(page: Page) {
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready
  })
  await expect
    .poll(() => page.evaluate(async () => (await caches.keys()).length), {
      message: 'precache was created',
    })
    .toBeGreaterThan(0)
}

/** Signs in through the form on /anmelden. */
export async function signInWithForm(page: Page, email: string, password: string) {
  await page.getByLabel(text.email).fill(email)
  await page.getByLabel(text.password, { exact: true }).fill(password)
  await page.getByRole('button', { name: text.signInButton }).click()
}
