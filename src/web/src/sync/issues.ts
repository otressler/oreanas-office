// The records the last sync could not save: conflicts, rejections and vanished items.
import { useLiveQuery } from 'dexie-react-hooks'
import type { SyncItemKind } from '../api/types'
import type { OfflineDb } from '../offline/db'
import type { SyncIssue, SyncState } from '../offline/sync'
import { ITEM_KINDS, itemTable, type ItemKind, type ItemRecord } from './records'

export interface IssueEntry {
  kind: SyncItemKind
  id: string
  campaignId: string
  name: string
  sync: SyncState
  issue: SyncIssue
  /** The record itself, for a campaign copy the copy. */
  record: ItemRecord | null
}

export interface IssueList {
  entries: IssueEntry[]
  /** Every local item's name by id, to name what an item depends on. */
  names: Map<string, string>
}

export async function loadIssues(db: OfflineDb): Promise<IssueList> {
  const entries: IssueEntry[] = []
  const names = new Map<string, string>()
  for (const copy of await db.campaigns.toArray()) {
    names.set(copy.id, copy.name)
    if (copy.local && copy.sync?.issue) {
      entries.push({
        kind: 'campaign',
        id: copy.id,
        campaignId: copy.id,
        name: copy.name,
        sync: copy.sync,
        issue: copy.sync.issue,
        record: null,
      })
    }
  }
  for (const kind of ITEM_KINDS) {
    for (const record of await itemTable(db, kind).toArray()) {
      names.set(record.id, record.name)
      if (!record.sync.issue) continue
      entries.push({
        kind,
        id: record.id,
        campaignId: record.campaignId,
        name: record.name,
        sync: record.sync,
        issue: record.sync.issue,
        record,
      })
    }
  }
  return { entries, names }
}

/** Live: the records with an issue. Undefined while loading. */
export function useIssues(db: OfflineDb | null): IssueList | undefined {
  return useLiveQuery(async () => (db ? loadIssues(db) : { entries: [], names: new Map() }), [db])
}

export const isItemKind = (kind: SyncItemKind): kind is ItemKind => kind !== 'campaign'
