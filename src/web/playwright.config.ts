import { createHash } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'

// Two modes:
// - default: build the app and serve it with `vite preview`; specs mock the API.
// - E2E_BASE_URL set (e.g. the Docker container): no web server, no mocks, and only
//   e2e/container.smoke.spec.ts runs against the real backend.
// Specs against a real backend in the E2E environment (*.backend.spec.ts) have
// their own config: playwright.backend.config.ts (`npm run test:e2e:backend`).
const containerUrl = process.env.E2E_BASE_URL

// Each checkout (this one and every agent worktree) previews its own build on its own
// port, from 41000 to 41999 by a hash of its path; E2E_PREVIEW_PORT picks another.
// A run doesn't reuse a server it didn't start: that server may serve another checkout's
// or an older build, and stops when the run that started it ends. Two overlapping runs
// in one checkout therefore fail at once on the taken port instead of testing the wrong
// build. E2E_REUSE_SERVER=1 reuses a preview you started yourself.
export const checkoutPort = (base: number) =>
  base + (createHash('sha1').update(import.meta.dirname.toLowerCase()).digest().readUInt32BE() % 1000)
const PREVIEW_PORT = Number(process.env.E2E_PREVIEW_PORT) || checkoutPort(41000)
export const reuseServer = process.env.E2E_REUSE_SERVER === '1'

// CI builds the app in a step of its own just before; E2E_PREBUILT=1 serves that build.
const build = process.env.E2E_PREBUILT === '1' ? '' : 'npm run build && '

export default defineConfig({
  testDir: './e2e',
  testMatch: containerUrl ? 'container.smoke.spec.ts' : '*.spec.ts',
  testIgnore: '*.backend.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: containerUrl ?? `http://localhost:${PREVIEW_PORT}`,
    locale: 'de-DE',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: containerUrl
    ? undefined
    : {
        command: `${build}npx vite preview --port ${PREVIEW_PORT} --strictPort`,
        url: `http://localhost:${PREVIEW_PORT}`,
        reuseExistingServer: reuseServer,
        // The service worker build (Workbox) can take a minute on Windows.
        timeout: 300_000,
      },
})
