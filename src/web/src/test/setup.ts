import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
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

afterEach(() => {
  cleanup()
})
