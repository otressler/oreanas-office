import { Navigate, Outlet, useLocation } from 'react-router'
import { LoadError } from '../components/ui'
import { NotFoundPage } from '../pages/NotFoundPage'
import { signInPath, useMe } from './auth'

/**
 * Route guard: renders the child routes for a signed-in user and sends everyone
 * else to the sign-in page, which returns here afterwards. Runs inside the
 * ServerGate, so the server is awake by the time it asks.
 */
export function RequireAuth() {
  const me = useMe()
  const location = useLocation()

  if (me.isPending) return null
  if (me.isError) return <LoadError error={me.error} onRetry={() => void me.refetch()} />
  if (!me.data) {
    return <Navigate replace to={signInPath(location.pathname + location.search)} />
  }
  return <Outlet />
}

/** Route guard for the site admin; others get the not-found page. */
export function RequireAdmin() {
  const me = useMe()
  return me.data?.isAdmin ? <Outlet /> : <NotFoundPage />
}
