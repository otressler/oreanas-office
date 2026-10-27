import type { RouteObject } from 'react-router'
import { RequireAdmin, RequireAuth } from './auth/RequireAuth'
import { Layout, type LayoutHandle } from './components/Layout'
import { WelcomeNewDevices } from './landing/WelcomeNewDevices'
import { RequireLocalUser } from './offline/RequireLocalUser'
import { AdminPage } from './pages/AdminPage'
import { CampaignPage } from './pages/CampaignPage'
import { CharacterPage } from './pages/CharacterPage'
import { HomePage } from './pages/HomePage'
import { ImprintPage } from './pages/ImprintPage'
import { InvitePage } from './pages/InvitePage'
import { JoinPage } from './pages/JoinPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PasswordResetPage } from './pages/PasswordResetPage'
import { PrivacyPage } from './pages/PrivacyPage'
import { ProfilePage } from './pages/ProfilePage'
import { RoadmapPage } from './pages/RoadmapPage'
import { SessionPage } from './pages/SessionPage'
import { SignInPage } from './pages/SignInPage'
import { ServerGateOutlet } from './server/ServerGate'

// German paths: people see and share them (invite and reset links).
export const routes: RouteObject[] = [
  // Full-screen pages without the header (stage 10): the spectator screen and the join page
  // the QR code opens. They sign in like every other page.
  {
    element: <ServerGateOutlet />,
    children: [
      {
        element: <RequireAuth />,
        children: [
          {
            path: 'kampagnen/:campaignId/sitzungen/:sessionId/zuschauen',
            lazy: async () => ({
              Component: (await import('./spectator/SpectatorPage')).SpectatorPage,
            }),
          },
        ],
      },
    ],
  },
  // The landing page brings its own header and footer, and like the roadmap it never
  // wakes the server. Loaded on demand: signed-in users rarely see it.
  {
    path: 'willkommen',
    lazy: async () => ({
      Component: (await import('./landing/LandingPage')).LandingPage,
    }),
  },
  {
    element: <WelcomeNewDevices />,
    children: [
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
                  {
                    index: true,
                    element: <HomePage />,
                    handle: { wide: true } satisfies LayoutHandle,
                  },
                  { path: 'profil', element: <ProfilePage /> },
                  { path: 'beitreten/:joinCode', element: <JoinPage /> },
                  {
                    path: 'kampagnen/:campaignId',
                    element: <CampaignPage />,
                    handle: { wide: true } satisfies LayoutHandle,
                  },
                  {
                    path: 'kampagnen/:campaignId/charaktere/neu',
                    element: <CharacterPage isNew />,
                    handle: { wide: true } satisfies LayoutHandle,
                  },
                  {
                    path: 'kampagnen/:campaignId/charaktere/:characterId',
                    element: <CharacterPage />,
                    handle: { wide: true } satisfies LayoutHandle,
                  },
                  { path: 'kampagnen/:campaignId/sitzungen/:sessionId', element: <SessionPage /> },
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
                    path: 'kampagnen/:campaignId/sitzungen/:sessionId/importieren',
                    lazy: async () => ({
                      Component: (await import('./pages/MapImportPage')).MapImportPage,
                    }),
                  },
                  {
                    element: <RequireAdmin />,
                    children: [{ path: 'admin', element: <AdminPage /> }],
                  },
                ],
              },
              { path: '*', element: <NotFoundPage /> },
            ],
          },
          // Static text: open to everyone and never wakes the server.
          { path: 'fahrplan', element: <RoadmapPage /> },
          { path: 'impressum', element: <ImprintPage /> },
          { path: 'datenschutz', element: <PrivacyPage /> },
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
                path: 'kampagnen/:campaignId/bestiarium',
                lazy: async () => ({
                  Component: (await import('./bestiary/BestiaryPage')).BestiaryPage,
                }),
              },
              {
                path: 'kampagnen/:campaignId/karten/:mapId',
                lazy: async () => ({
                  Component: (await import('./editor/EditorPage')).EditorPage,
                }),
              },
              // The same page; encounter mode reads the encounterId param.
              {
                path: 'kampagnen/:campaignId/karten/:mapId/begegnungen/:encounterId',
                lazy: async () => ({
                  Component: (await import('./editor/EditorPage')).EditorPage,
                }),
              },
            ],
          },
        ],
      },
    ],
  },
]
