import { defineConfig, devices } from '@playwright/test'

// Two modes:
// - default: build the app and serve it with `vite preview`; specs mock /api/health.
// - E2E_BASE_URL set (e.g. the Docker container): no web server, no mocks, and only
//   e2e/container.smoke.spec.ts runs against the real backend.
const containerUrl = process.env.E2E_BASE_URL
const PREVIEW_PORT = 4173

export default defineConfig({
  testDir: './e2e',
  testMatch: containerUrl ? 'container.smoke.spec.ts' : '*.spec.ts',
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
        command: `npm run build && npx vite preview --port ${PREVIEW_PORT} --strictPort`,
        url: `http://localhost:${PREVIEW_PORT}`,
        reuseExistingServer: !process.env.CI,
        // The service worker build (Workbox) can take a minute on Windows.
        timeout: 300_000,
      },
})
