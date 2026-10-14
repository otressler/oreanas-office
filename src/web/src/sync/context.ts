// The offline database the sync client works on, provided by <SyncProvider>.
import { createContext, useContext } from 'react'
import type { OfflineDb } from '../offline/db'

export const SyncContext = createContext<{ db: OfflineDb } | null>(null)

/** The user's offline database inside <SyncProvider>, or null (nobody signed in here). */
export function useSyncDb(): OfflineDb | null {
  return useContext(SyncContext)?.db ?? null
}
