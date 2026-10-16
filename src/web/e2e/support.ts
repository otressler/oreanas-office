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
  sessionsTitle: 'Sitzungen',
  newSession: 'Neue Sitzung',
  sessionTitle: 'Titel',
  activate: 'Starten',
  activeStatus: 'Läuft',
  activeSessionLabel: 'Läuft gerade',
  profileLink: (name: string) => `Profil von ${name}`,
  // The live table (de.table and the move error codes).
  pickTarget: (name: string) => `${name}: Tippe auf das Feld, auf das die Figur soll.`,
  confirmHint: (name: string) => `${name} hierhin? Tippe noch einmal darauf zum Bestätigen.`,
  confirmMove: 'Hierhin',
  undo: 'Rückgängig',
  invalidTarget: 'Dort kann die Figur nicht stehen. Wähle ein anderes Feld.',
  movingOff: 'Ohne Verbindung zum Tisch lassen sich keine Figuren bewegen.',
  reconnecting: 'Verbindung weg – verbinde neu…',
  idle: 'Pausiert – tippe, um weiterzuspielen',
  notYourToken: 'Diese Figur darfst du nicht bewegen.',
  // The map list and offline map pages (de.maps).
  campaignMaps: /^Karten/,
  mapListTitle: (campaign: string) => `Karten – ${campaign}`,
  newMapTitle: 'Neue Karte',
  mapName: 'Name',
  createMap: 'Anlegen',
  editMap: (name: string) => `${name} bearbeiten`,
  duplicateMap: (name: string) => `${name} duplizieren`,
  archiveMap: (name: string) => `${name} archivieren`,
  restoreMap: (name: string) => `${name} zurückholen`,
  archivedMaps: (count: number) => `Archiviert (${count})`,
  localOnly: 'Nur auf diesem Gerät',
  backToMapList: 'Zur Kartenliste',
  backToCampaign: 'Zur Kampagne',
  offlineMapsLink: 'Karten ohne Verbindung bearbeiten',
  offlineMapsTitle: 'Deine Karten',
  editorNarrowTitle: 'Der Karteneditor ist für Laptops gedacht',
}

/**
 * The screen position of a cell's centre on the board (or, with `surface`, the map
 * editor's canvas), read from the newest Konva stage's transform.
 */
export async function cellCentre(
  page: Page,
  x: number,
  y: number,
  surface = '[data-board-surface]',
) {
  const box = await page.locator(surface).boundingBox()
  const stage = await page.evaluate(() => {
    const s = (
      window as unknown as { Konva: { stages: { x(): number; y(): number; scaleX(): number }[] } }
    ).Konva.stages.at(-1)!
    return { x: s.x(), y: s.y(), scale: s.scaleX() }
  })
  const cell = 64 * stage.scale
  return {
    x: box!.x + stage.x + (x + 0.5) * cell,
    y: box!.y + stage.y + (y + 0.5) * cell,
  }
}

/** When each page last tapped, so two taps in a row stay two taps. */
const lastTaps = new WeakMap<Page, number>()

/**
 * Taps (clicks) a cell of the board. Taps come at least 350 ms apart: two quicker ones
 * on the same spot are a double tap, which pings (DOUBLE_TAP_MS in src/board/gestures.ts).
 */
export async function tapCell(page: Page, x: number, y: number) {
  const wait = (lastTaps.get(page) ?? 0) + 350 - Date.now()
  if (wait > 0) await page.waitForTimeout(wait)
  const point = await cellCentre(page, x, y)
  await page.mouse.click(point.x, point.y)
  lastTaps.set(page, Date.now())
}

/** A double tap on a cell: two clicks within the double-tap time. */
export async function doubleTapCell(page: Page, x: number, y: number) {
  const point = await cellCentre(page, x, y)
  await page.mouse.click(point.x, point.y)
  await page.mouse.click(point.x, point.y)
  lastTaps.set(page, Date.now())
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
