// The offline pages (map list and editor) open without the server: they run outside
// the ServerGate and trust the last user the server confirmed on this device
// (offline/identity.ts). Each user's data lives in their own database (offline/db.ts).
import { useMemo } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { signInPath } from '../auth/auth'
import { offlineDb } from './db'
import { SyncProvider } from '../sync'
import { lastUser } from './identity'
import { LocalUserContext } from './localUser'

/** Route guard: the offline pages for the device's last user, else the sign-in page. */
export function RequireLocalUser() {
  const location = useLocation()
  const userId = lastUser()?.id
  const value = useMemo(() => {
    const user = lastUser()
    return user && user.id === userId ? { user, db: offlineDb(user.id) } : null
  }, [userId])
  if (!value) return <Navigate replace to={signInPath(location.pathname + location.search)} />
  return (
    <LocalUserContext.Provider value={value}>
      <SyncProvider>
        <Outlet />
      </SyncProvider>
    </LocalUserContext.Provider>
  )
}
