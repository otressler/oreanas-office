// The browser's offline store (knowledge/decisions/offline-prep-pwa.md): one IndexedDB
// database per user, so a second account in the same browser sees nothing of the
// first. Stage 5 keeps battle maps and a copy of the user's campaigns; stage 6 adds
// encounters, creature types and the sync queue in a new Dexie version.
import { Dexie, type EntityTable } from 'dexie'
import type { CampaignRole } from '../api/types'
import type { LocalMap } from '../editor/model'

/** A campaign as last seen online. Members and roles can't change offline. */
export interface CampaignCopy {
  id: string
  name: string
  myRole: CampaignRole
  /** ISO timestamp of the copy. */
  savedAt: string
}

export class OfflineDb extends Dexie {
  maps!: EntityTable<LocalMap, 'id'>
  campaigns!: EntityTable<CampaignCopy, 'id'>

  constructor(userId: string) {
    super(offlineDbName(userId))
    this.version(1).stores({
      maps: 'id, campaignId',
      campaigns: 'id',
    })
  }
}

export function offlineDbName(userId: string): string {
  return `oreana-${userId}`
}

const open = new Map<string, OfflineDb>()

/** The user's offline database; one instance per user for the page's lifetime. */
export function offlineDb(userId: string): OfflineDb {
  let db = open.get(userId)
  if (!db) {
    db = new OfflineDb(userId)
    open.set(userId, db)
  }
  return db
}

/** Closes and forgets every open database. For tests. */
export function closeOfflineDbs(): void {
  for (const db of open.values()) db.close()
  open.clear()
}
