import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

// Calm dark "table" colour; keep in sync with --color-table in src/index.css.
const TABLE_COLOR = '#14161b'

// The ASP.NET Core backend during local development (scripts/dev.ps1). The
// real-backend Playwright mode points it elsewhere; `vite preview` uses the same proxy.
const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:5080'

// The Impressum's details (src/pages/ImprintPage.tsx) are baked into the build from
// IMPRINT_* in the environment (CI's repository variables, the Dockerfile's build args) or
// the repository's .env, so they never enter the repository. Unit tests leave them out.
function imprintDefines(mode: string) {
  if (mode === 'test') return {}
  const env = loadEnv(mode, `${import.meta.dirname}/../..`, 'IMPRINT_')
  return Object.fromEntries(
    Object.entries(env)
      .filter(([, value]) => value.trim() !== '')
      .map(([key, value]) => [`import.meta.env.VITE_${key}`, JSON.stringify(value.trim())]),
  )
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  define: imprintDefines(mode),
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version waits until the user agrees to reload (UpdatePrompt.tsx),
      // so it never reloads the page in the middle of a fight.
      registerType: 'prompt',
      injectRegister: false,
      // The glob below already picks up the icons; this avoids listing them twice.
      includeManifestIcons: false,
      manifest: {
        name: "Oreana's Office",
        short_name: 'Oreana',
        description: 'Kampfkarten für eure D&D-Runde, live auf jedem Gerät.',
        lang: 'de',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        theme_color: TABLE_COLOR,
        background_color: TABLE_COLOR,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: 'maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // App shell and static files only. API calls, sign-in and SignalR are
        // never cached (knowledge/decisions/frontend-stack.md), except images below.
        // The condition icons (statuses/<key>.webp) are part of the app, so they work offline.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}', 'statuses/*.webp'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api(\/|$)/, /^\/hubs(\/|$)/, /^\/signin-/, /^\/signout/],
        cleanupOutdatedCaches: true,
        // Generated images never change once made, so the board shows them again offline
        // and after reloads without a download (knowledge/decisions/persistence.md, "How
        // images reach the browser"). Only /api/assets/; no other API route is cached.
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith('/api/assets/'),
            handler: 'CacheFirst',
            options: {
              // Cleared on every sign-in and sign-out (IMAGE_CACHE in src/auth/auth.ts).
              cacheName: 'oreana-images',
              expiration: { maxEntries: 60 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
    }),
  ],
  server: {
    proxy: {
      '/api': { target: BACKEND },
      '/hubs': { target: BACKEND, ws: true },
    },
  },
  test: {
    environment: 'jsdom',
    // pool: "vmThreads", /* performance optimization, but causes issues with some tests, so it is disabled for now */
    // isolate: false, /* performance optimization, but causes issues with some tests, so it is disabled for now */
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    // Form tests type through user-event and some open the lazily loaded editor; under a
    // full parallel run on a laptop they can take longer than the default 5 s.
    testTimeout: 15_000,
    unstubGlobals: true,
    unstubEnvs: true,
  },
}))
