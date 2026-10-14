// The browser's offline store (knowledge/decisions/offline-prep-pwa.md): one IndexedDB
// database per user, so a second account in the same browser sees nothing of the
// first. Version 1 (stage 5) kept battle maps and a copy of the user's campaigns;
// version 2 (stage 6) adds creature types, encounters and `meta`, and the sync fields.
import { Dexie, type EntityTable } from 'dexie'
import type { CampaignRole } from '../api/types'
import type { LocalMap } from '../editor/model'
import type { LocalCreatureType, LocalEncounter } from './model'
import type { SyncState } from './sync'

/** A campaign as last seen online. Members and roles can't change offline. */
export interface CampaignCopy {
  id: string
  name: string
  myRole: CampaignRole
  /** ISO timestamp of the copy. */
  savedAt: string
  /** Created on this device and not on the server yet: no join code, no members but the creator. */
  local: boolean
  /** Only for campaigns created here; null for copies of server campaigns. */
  sync: SyncState | null
}

/** Small values the sync keeps, e.g. the last pull per campaign. */
export interface MetaRecord {
  key: string
  value: unknown
}

export class OfflineDb extends Dexie {
  maps!: EntityTable<LocalMap, 'id'>
  campaigns!: EntityTable<CampaignCopy, 'id'>
  creatureTypes!: EntityTable<LocalCreatureType, 'id'>
  encounters!: EntityTable<LocalEncounter, 'id'>
  meta!: EntityTable<MetaRecord, 'key'>

  constructor(userId: string) {
    super(offlineDbName(userId))
    this.version(1).stores({
      maps: 'id, campaignId',
      campaigns: 'id',
    })
    this.version(2)
      .stores({
        maps: 'id, campaignId',
        campaigns: 'id',
        creatureTypes: 'id, campaignId',
        encounters: 'id, campaignId, battleMapId',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        // Maps and campaign copies written by stage 5 get the sync fields of stage 6.
        await tx
          .table('maps')
          .toCollection()
          .modify((map) => {
            map.sync = { ...map.sync, issue: null, server: null }
          })
        await tx
          .table('campaigns')
          .toCollection()
          .modify((copy) => {
            copy.local = false
            copy.sync = null
          })
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
