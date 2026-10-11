import { defineConfig } from '@playwright/test'
import base from './playwright.config.ts'

// `npm run test:e2e:backend`: the *.backend.spec.ts specs against the real
// backend. Starts SQL Server and Azurite (Docker Compose), runs the backend in
// the E2E environment with its own database (that environment adds
// POST /api/testing/invites), and serves the build with `vite preview`, whose
// proxy forwards /api to that backend. Docker must be running.
const BACKEND_URL = 'http://localhost:5081'
const PREVIEW_PORT = 4180

export default defineConfig({
  ...base,
  testMatch: '*.backend.spec.ts',
  testIgnore: undefined,
  use: { ...base.use, baseURL: `http://localhost:${PREVIEW_PORT}` },
  webServer: [
    {
      command:
        'docker compose -f ../../docker-compose.yml up -d sql azurite && dotnet run --project ../Server --no-launch-profile',
      // /api/health answers 200 only once the database is migrated.
      url: `${BACKEND_URL}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: {
        ASPNETCORE_ENVIRONMENT: 'E2E',
        ASPNETCORE_URLS: BACKEND_URL,
        ConnectionStrings__Database:
          'Server=localhost,1433;Database=OreanasOffice_E2E;User Id=sa;Password=Local_Dev_Only_1;TrustServerCertificate=True',
        ConnectionStrings__Storage: 'UseDevelopmentStorage=true',
      },
    },
    {
      command: `npm run build && npx vite preview --port ${PREVIEW_PORT} --strictPort`,
      url: `http://localhost:${PREVIEW_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 300_000,
      env: { BACKEND_URL },
    },
  ],
})
