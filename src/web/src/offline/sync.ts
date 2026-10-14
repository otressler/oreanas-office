// The sync bookkeeping every offline item carries (knowledge/decisions/offline-prep-pwa.md,
// "Versions and IDs"): which server version the copy is based on, whether it changed since,
// and why the last push did not save it.
import type { ApiErrorBody, ApiLayoutProblem, SyncServerItem } from '../api/types'

/** Why an item isn't synced although the device tried. Cleared when a push succeeds. */
export type SyncIssue =
  | { kind: 'conflict'; server: SyncServerItem }
  | {
      kind: 'rejected'
      error: ApiErrorBody
      dependsOnId?: string | null
      problems?: ApiLayoutProblem[] | null
      existingCreatureTypeId?: string | null
    }
  /** The server no longer lists the item (e.g. lost `dm` rights) while it has local changes. */
  | { kind: 'vanished' }

/** Sync bookkeeping per item. */
export interface SyncState {
  /** The server version this copy is based on; 0 for an item the server has never seen. */
  baseVersion: number
  /** Changed since the last successful push ("Nicht synchronisiert"). */
  changed: boolean
  /** Raised on every save, so a push can tell whether the item changed while it ran. */
  editCount: number
  /** Why the last push didn't save it; null when there is nothing to show. */
  issue: SyncIssue | null
  /** Who saved the server version `baseVersion`, and when; null until the server has it. */
  server: { updatedAt: string; updatedBy: string | null } | null
}

/** Marks a record changed: sets `changed`, raises `editCount`, keeps the rest. */
export function markChanged(sync: SyncState): SyncState {
  return { ...sync, changed: true, editCount: sync.editCount + 1 }
}

/** A fresh state for an item made on this device. */
export function newSyncState(): SyncState {
  return { baseVersion: 0, changed: true, editCount: 1, issue: null, server: null }
}

/** The state of an item just pulled from the server. */
export function pulledSyncState(item: SyncServerItem): SyncState {
  return {
    baseVersion: item.version,
    changed: false,
    editCount: 0,
    issue: null,
    server: { updatedAt: item.updatedAt, updatedBy: item.updatedByDisplayName ?? null },
  }
}
