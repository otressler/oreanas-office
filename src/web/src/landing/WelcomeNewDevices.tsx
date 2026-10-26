import { Navigate, Outlet, useMatch } from 'react-router'
import { lastUser } from '../offline/identity'

/**
 * Route element above the app shell: on a device where nobody has signed in yet,
 * `/` shows the landing page instead of waking the server for a sign-in page.
 * Everyone else, and every other path, goes on as before.
 */
export function WelcomeNewDevices() {
  const atStart = useMatch('/') !== null
  if (atStart && !lastUser()) return <Navigate replace to="/willkommen" />
  return <Outlet />
}
