// The sync client's entry points (knowledge/decisions/offline-prep-pwa.md, "Sync
// protocol"). Stubs in the stage 6 contract; the sync client lane builds them.
import type { OfflineDb } from '../offline/db'

/** Matches SyncProtocol.CurrentVersion on the server. */
export const SYNC_VERSION = 1
export const SYNC_VERSION_HEADER = 'X-Sync-Version'

export type SyncStatus =
  /** "Alles synchronisiert" when pending is 0, else "3 Änderungen nicht synchronisiert". */
  | { state: 'idle'; pending: number }
  | { state: 'syncing' }
  | { state: 'offline'; pending: number }
  /** Conflicts or rejections are waiting. */
  | { state: 'attention'; pending: number; issues: number }
  /** "Bitte neu laden". */
  | { state: 'outdated' }
  /** Sign in again; the data is kept. */
  | { state: 'signedOut' }

export interface SyncResult {
  ok: boolean
  issues: number
}

export type SyncReason =
  'button' | 'leaveEditor' | 'online' | 'editorOpen' | 'beforeStart' | 'store'

/** Runs one sync (push, then pull) for the local user; one at a time per browser (Web Locks). */
export function syncNow(_db: OfflineDb, _options?: { reason?: SyncReason }): Promise<SyncResult> {
  return Promise.resolve({ ok: true, issues: 0 })
}

/**
 * Pushes the encounter and what it needs (its map, its creature types, a local campaign).
 * Resolves 'ready' when the server has the device's version, 'blocked' when a conflict or
 * rejection must be resolved first, 'offline' without a connection.
 */
export function syncBeforeStart(
  _db: OfflineDb,
  _encounterId: string,
): Promise<'ready' | 'blocked' | 'offline'> {
  return Promise.resolve('ready')
}

/** The current status, live. */
export function useSyncStatus(): SyncStatus {
  return { state: 'idle', pending: 0 }
}
