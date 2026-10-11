import { expect, type BrowserContext, type Page } from '@playwright/test'

// Text the specs look for; mirrors src/text/de.ts.
export const text = {
  appName: "Oreana's Office",
  homeTitle: 'Der Tisch ist bald bereit',
  notFoundTitle: 'Diese Seite gibt es nicht',
  wakingTitle: 'Der Tisch wird geweckt…',
  offlineTitle: 'Keine Verbindung',
  installButton: 'App installieren',
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
