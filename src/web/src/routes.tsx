import type { RouteObject } from 'react-router'
import { RequireAdmin, RequireAuth } from './auth/RequireAuth'
import { Layout } from './components/Layout'
import { AdminPage } from './pages/AdminPage'
import { CampaignPage } from './pages/CampaignPage'
import { HomePage } from './pages/HomePage'
import { InvitePage } from './pages/InvitePage'
import { NotFoundPage } from './pages/NotFoundPage'
import { PasswordResetPage } from './pages/PasswordResetPage'
import { ProfilePage } from './pages/ProfilePage'
import { SignInPage } from './pages/SignInPage'

// German paths: people see and share them (invite and reset links).
export const routes: RouteObject[] = [
  {
    element: <Layout />,
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
          { element: <RequireAdmin />, children: [{ path: 'admin', element: <AdminPage /> }] },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
]
