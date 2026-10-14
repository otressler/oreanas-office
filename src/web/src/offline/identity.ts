// Who used this device last (knowledge/decisions/offline-prep-pwa.md, "Per user and
// kept"). The sign-in cookie is HttpOnly and only the server can check it, so the
// offline pages trust the last user the server confirmed. Signing out forgets the
// user here but keeps their offline data, which only that user's pages open.
import type { Me } from '../api/types'

const KEY = 'oreana.lastUser'

/** The last user GET /api/auth/me returned on this device, or null. */
export function lastUser(): Me | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<Me>
    return typeof value.id === 'string' && typeof value.displayName === 'string'
      ? (value as Me)
      : null
  } catch {
    return null
  }
}

/** Remembers the signed-in user; forgets them when `me` is null (signed out). */
export function rememberUser(me: Me | null): void {
  try {
    if (me) localStorage.setItem(KEY, JSON.stringify(me))
    else localStorage.removeItem(KEY)
  } catch {
    // Without storage (private mode, blocked site data) the offline pages need a sign-in.
  }
}
