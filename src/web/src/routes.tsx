import type { RouteObject } from 'react-router'
import { RequireAdmin, RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { RequireLocalUser } from './offline/RequireLocalUser'
import { AdminPage } from './pages/AdminPage'
import { CampaignPage } from './pages/CampaignPage'
import { HomePage } from './pages/HomePage'
import { InvitePage } from './pages/InvitePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PasswordResetPage } from './pages/PasswordResetPage'
import { ProfilePage } from './pages/ProfilePage'
import { RoadmapPage } from './pages/RoadmapPage'
import { SignInPage } from './pages/SignInPage'
import { ServerGateOutlet } from './server/ServerGate'

// German paths: people see and share them (invite and reset links).
export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      {
        element: <ServerGateOutlet />,
        children: [
          { path: 'anmelden', element: <SignInPage /> },
          { path: 'einladung/:token', element: <InvitePage /> },
          { path: 'passwort-zuruecksetzen', element: <PasswordResetPage /> },
          {
            element: <RequireAuth />,
            children: [
              { index: true, element: <HomePage /> },
              { path: 'profil', element: <ProfilePage /> },
              { path: 'kampagnen/:campaignId', element: <CampaignPage /> },
              // The board pages load on demand: Konva alone would double the app shell.
              {
                path: 'kampagnen/:campaignId/kampf/:encounterId',
                lazy: async () => ({
                  Component: (await import('./pages/EncounterPage')).EncounterPage,
                }),
              },
              {
                path: 'kampagnen/:campaignId/sitzungen/:sessionId/kampf/:encounterId/aufstellen',
                lazy: async () => ({
                  Component: (await import('./pages/EncounterSetupPage')).EncounterSetupPage,
                }),
              },
              {
                path: 'kampagnen/:campaignId/karten/importieren',
                lazy: async () => ({
                  Component: (await import('./pages/MapImportPage')).MapImportPage,
                }),
              },
              { element: <RequireAdmin />, children: [{ path: 'admin', element: <AdminPage /> }] },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      // Static text: open to everyone and never wakes the server.
      { path: 'fahrplan', element: <RoadmapPage /> },
      // The map pages work offline and never wake the server
      // (knowledge/decisions/offline-prep-pwa.md). Their code is in the cached app shell.
      {
        element: <RequireLocalUser />,
        children: [
          {
            path: 'karten',
            lazy: async () => ({
              Component: (await import('./maps/OfflineMapsPage')).OfflineMapsPage,
            }),
          },
          {
            path: 'kampagnen/:campaignId/karten',
            lazy: async () => ({
              Component: (await import('./maps/MapListPage')).MapListPage,
            }),
          },
          {
            path: 'kampagnen/:campaignId/karten/:mapId',
            lazy: async () => ({
              Component: (await import('./editor/EditorPage')).EditorPage,
            }),
          },
        ],
      },
    ],
  },
]
