// What the sync client keeps in memory: whether a sync runs, why it stopped, which records
// an open editor holds, and which dialog is open. The data itself stays in the offline
// database (knowledge/decisions/offline-prep-pwa.md).
import { create } from 'zustand'
import { useSyncExternalStore } from 'react'
import type { OfflineDb } from '../offline/db'

export interface SyncStore {
  /** Syncs running right now (a sync waiting for the lock counts too). */
  running: number
  /** Set by a 426 or a 401: nothing syncs until the page reloads or the user signs in again. */
  blocked: 'outdated' | 'signedOut' | null
  /** The last sync found no connection. */
  offline: boolean
  /** The last sync failed for another reason (server error); shown next to the button. */
  failed: boolean
  /** Raised whenever a sync created a campaign, so the campaign list can reload. */
  campaignsCreated: number
}

export const useSyncStore = create<SyncStore>(() => ({
  running: 0,
  blocked: null,
  offline: false,
  failed: false,
  campaignsCreated: 0,
}))

/** Clears the in-memory state. For tests. */
export function resetSyncState(): void {
  useSyncStore.setState({
    running: 0,
    blocked: null,
    offline: false,
    failed: false,
    campaignsCreated: 0,
  })
  holds.clear()
  for (const timer of timers) clearTimeout(timer)
  timers.clear()
  useSyncDialog.setState({ open: false, focusId: null })
}

// ---- Delayed syncs ---------------------------------------------------------------------------

const timers = new Set<ReturnType<typeof setTimeout>>()

/** Runs `job` after `ms`; a pending one can be cancelled with resetSyncState (tests). */
export function runLater(job: () => void, ms: number): void {
  const timer = setTimeout(() => {
    timers.delete(timer)
    job()
  }, ms)
  timers.add(timer)
}

// ---- Records an open editor works on -------------------------------------------------

const holds = new Map<string, number>()

/**
 * The editor owns the map (and the encounter) it has open: a pull leaves them alone, so it
 * can't replace what the editor is about to save over. Returns the release function.
 */
export function holdRecords(ids: readonly string[]): () => void {
  for (const id of ids) holds.set(id, (holds.get(id) ?? 0) + 1)
  return () => {
    for (const id of ids) {
      const count = (holds.get(id) ?? 1) - 1
      if (count <= 0) holds.delete(id)
      else holds.set(id, count)
    }
  }
}

export function heldRecords(): ReadonlySet<string> {
  return new Set(holds.keys())
}

// ---- The dialogs ----------------------------------------------------------------------

interface SyncDialogState {
  open: boolean
  /** The record to show first, e.g. when a list row was clicked. */
  focusId: string | null
}

export const useSyncDialog = create<SyncDialogState>(() => ({ open: false, focusId: null }))

/** Opens the dialog for conflicts and rejections. */
export function openSyncIssues(focusId: string | null = null): void {
  useSyncDialog.setState({ open: true, focusId })
}

export function closeSyncIssues(): void {
  useSyncDialog.setState({ open: false, focusId: null })
}

// ---- Connection -------------------------------------------------------------------------

function subscribeOnline(callback: () => void) {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

/** Whether the browser thinks it has a connection. */
export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine)
}

// ---- Counting ------------------------------------------------------------------------------

export interface Unsynced {
  /** Records changed on this device and not on the server. */
  pending: number
  /** Records with a conflict, a rejection or a vanished mark. */
  issues: number
}

/** What is waiting in the offline database of the user. */
export async function countUnsynced(db: OfflineDb): Promise<Unsynced> {
  const syncs = [
    ...(await db.campaigns.filter((copy) => copy.local).toArray()).map((copy) => copy.sync),
    ...(await db.creatureTypes.toArray()).map((record) => record.sync),
    ...(await db.maps.toArray()).map((record) => record.sync),
    ...(await db.encounters.toArray()).map((record) => record.sync),
  ]
  let pending = 0
  let issues = 0
  for (const sync of syncs) {
    if (!sync) continue
    if (sync.changed) pending += 1
    if (sync.issue) issues += 1
  }
  return { pending, issues }
}
