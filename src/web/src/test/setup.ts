import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach, vi } from 'vitest'

// The PWA plugin's virtual module exists only in Vite builds; pages rendered in
// tests (through Layout's UpdatePrompt) see a service worker without updates.
vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [false, () => {}],
    offlineReady: [false, () => {}],
    updateServiceWorker: async () => {},
  }),
}))

// The board pages load lazily (routes.tsx); in a busy parallel run the first load
// can take longer than Testing Library's default second.
configure({ asyncUtilTimeout: 5000 })

// No test opens a real SignalR connection: pages with the live table get a fake hub
// (src/table/testing.ts) that the fight page's tests control through `fakeTable`.
vi.mock('../table/createConnection', async () => {
  const { fakeTable } = await import('../table/testing')
  return { createTableConnection: () => fakeTable.hub.factory() }
})

afterEach(() => {
  cleanup()
})
