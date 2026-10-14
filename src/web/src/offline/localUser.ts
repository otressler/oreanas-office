// The user and offline database of the offline pages, provided by <RequireLocalUser>.
import { createContext, useContext } from 'react'
import type { Me } from '../api/types'
import type { OfflineDb } from './db'

export interface LocalUser {
  user: Me
  db: OfflineDb
}

export const LocalUserContext = createContext<LocalUser | null>(null)

/** The user and offline database inside <RequireLocalUser>. */
export function useLocalUser(): LocalUser {
  const value = useContext(LocalUserContext)
  if (!value) throw new Error('useLocalUser outside <RequireLocalUser>')
  return value
}
