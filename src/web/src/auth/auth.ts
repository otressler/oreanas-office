// Who is signed in. The cookie is HttpOnly, so the only source is GET /api/auth/me:
// 200 is the user, 401 means signed out (knowledge/decisions/auth.md).
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client'
import { ApiRequestError } from '../api/errors'
import { meQueryKey } from '../api/queryClient'
import type { Me } from '../api/types'
import { rememberUser } from '../offline/identity'

async function fetchMe(): Promise<Me | null> {
  const { data, response } = await api.GET('/api/auth/me')
  if (response.status === 401) {
    rememberUser(null)
    return null
  }
  if (!response.ok || !data) throw new ApiRequestError(response.status)
  // The offline pages (map editor) open for this user without asking the server.
  rememberUser(data)
  return data
}

/** The signed-in user, or null. `enabled: false` waits, e.g. until the server is awake. */
export function useMe({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: meQueryKey, queryFn: fetchMe, enabled, staleTime: 5 * 60_000 })
}

/** The signed-in user inside pages behind <RequireAuth>, which guarantees one. */
export function useCurrentUser(): Me {
  const { data } = useMe()
  if (!data) throw new Error('useCurrentUser outside <RequireAuth>')
  return data
}

/**
 * Records a sign-in or sign-out and drops everything cached for the previous
 * user. The `me` query itself is updated in place so its observers re-render.
 */
export function useSetSignedIn() {
  const queryClient = useQueryClient()
  return (me: Me | null) => {
    rememberUser(me)
    queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== meQueryKey[0] })
    queryClient.setQueryData(meQueryKey, me)
  }
}

export function useAuthOptions() {
  return useQuery({
    queryKey: ['auth-options'],
    queryFn: async () => (await api.GET('/api/auth/options')).data ?? { googleEnabled: false },
    staleTime: Infinity,
  })
}

/**
 * A local path to return to after signing in. Anything else (other sites,
 * protocol-relative `//host`, backslash tricks) falls back to the home page.
 */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) {
    return '/'
  }
  return value
}

/** The sign-in page, returning to `returnPath` afterwards. */
export function signInPath(returnPath: string): string {
  return returnPath === '/'
    ? '/anmelden'
    : `/anmelden?${new URLSearchParams({ zurueck: returnPath })}`
}

/** Google is a full page navigation through the server, never fetch. */
export function googleLoginUrl(returnPath: string, inviteToken?: string): string {
  const query = new URLSearchParams({ returnUrl: safeReturnPath(returnPath) })
  if (inviteToken) query.set('invite', inviteToken)
  return `/api/auth/google/login?${query}`
}

export function googleLinkUrl(returnPath: string): string {
  return `/api/auth/google/link?${new URLSearchParams({ returnUrl: returnPath })}`
}
