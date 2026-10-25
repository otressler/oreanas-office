// What the sync knows about each kind of offline record: how to read one from the offline
// database, turn it into push data, build it from the server's copy, and tell whether two
// copies hold the same data (knowledge/decisions/offline-prep-pwa.md, "Items").
import type { EntityTable } from 'dexie'
import type { SyncCreatureToken, SyncItemKind, SyncPushItem, SyncServerItem } from '../api/types'
import type { LocalMap } from '../editor/model'
import { LOCAL_MAP_RECORD_VERSION } from '../editor/model'
import type { CampaignCopy, OfflineDb } from '../offline/db'
import {
  LOCAL_CREATURE_TYPE_RECORD_VERSION,
  LOCAL_ENCOUNTER_RECORD_VERSION,
  type LocalCreatureType,
  type LocalEncounter,
} from '../offline/model'
import { pulledSyncState, type SyncState } from '../offline/sync'

/** The kinds kept in their own table; campaigns are the campaign copies. */
export type ItemKind = Exclude<SyncItemKind, 'campaign'>
export type ItemRecord = LocalMap | LocalCreatureType | LocalEncounter

/** The order a push sends the kinds in: what an item needs comes before it. */
export const PUSH_ORDER: SyncItemKind[] = ['campaign', 'creatureType', 'battleMap', 'encounter']

export function itemTable(db: OfflineDb, kind: ItemKind): EntityTable<ItemRecord, 'id'> {
  const tables = {
    creatureType: db.creatureTypes,
    battleMap: db.maps,
    encounter: db.encounters,
  }
  return tables[kind] as unknown as EntityTable<ItemRecord, 'id'>
}

export const ITEM_KINDS: ItemKind[] = ['creatureType', 'battleMap', 'encounter']

/** The sync state of a campaign copy that was made on this device. */
export function campaignSync(copy: CampaignCopy): SyncState | null {
  return copy.local ? copy.sync : null
}

/** Whether a record still has to go to the server: changed, and nothing waits for the DM. */
export function pushable(sync: SyncState): boolean {
  return sync.changed && sync.issue?.kind !== 'conflict' && sync.issue?.kind !== 'vanished'
}

/** Devices push drafts and ready encounters only; active and ended ones belong to the server. */
export function isPushableRecord(
  kind: SyncItemKind,
  record: { sync: SyncState } & object,
): boolean {
  if (kind === 'encounter') {
    const status = (record as LocalEncounter).status
    if (status !== 'draft' && status !== 'ready') return false
  }
  return pushable(record.sync)
}

function pushTokens(encounter: LocalEncounter): SyncCreatureToken[] {
  return encounter.tokens.map(
    ({
      id,
      creatureTypeId,
      label,
      x,
      y,
      size,
      hidden = false,
      initiativeModifier = null,
      initiativeRollMode = null,
    }) => ({
      id,
      creatureTypeId,
      label,
      x,
      y,
      size,
      hidden,
      initiativeModifier,
      initiativeRollMode,
    }),
  )
}

const empty = { campaign: null, creatureType: null, map: null, encounter: null }

/** The push request's item for a campaign copy made here. */
export function campaignPushItem(copy: CampaignCopy): SyncPushItem {
  return {
    ...empty,
    id: copy.id,
    kind: 'campaign',
    campaignId: copy.id,
    baseVersion: 0,
    campaign: { name: copy.name },
  }
}

/** The push request's item for a record. */
export function recordPushItem(kind: ItemKind, record: ItemRecord): SyncPushItem {
  const base = { ...empty, id: record.id, kind, campaignId: record.campaignId }
  const baseVersion = record.sync.baseVersion
  switch (kind) {
    case 'creatureType': {
      const r = record as LocalCreatureType
      return {
        ...base,
        baseVersion,
        creatureType: {
          name: r.name,
          size: r.size,
          appearance: r.appearance,
          notes: r.notes,
          archivedAt: r.archivedAt,
          initiativeModifier: r.initiativeModifier ?? 0,
          initiativeRollMode: r.initiativeRollMode ?? 'normal',
        },
      }
    }
    case 'battleMap': {
      const r = record as LocalMap
      return {
        ...base,
        baseVersion,
        map: {
          name: r.name,
          width: r.width,
          height: r.height,
          layout: r.layout,
          scene: r.scene,
          vibe: r.vibe,
          lighting: r.lighting,
          archivedAt: r.archivedAt,
          copiedFromMapId: r.copiedFromMapId,
        },
      }
    }
    case 'encounter': {
      const r = record as LocalEncounter
      return {
        ...base,
        baseVersion,
        encounter: {
          name: r.name,
          battleMapId: r.battleMapId,
          // Checked by isPushableRecord: only draft and ready get here.
          status: r.status,
          archivedAt: r.archivedAt,
          tokens: pushTokens(r),
          sessionId: r.sessionId,
          fog: r.fog ?? null,
        },
      }
    }
  }
}

/** The record the server's copy makes; `existing` keeps what the server doesn't send. */
export function recordFromServer(item: SyncServerItem, existing?: ItemRecord): ItemRecord {
  const createdAt = existing?.createdAt ?? item.updatedAt
  const common = {
    id: item.id,
    campaignId: item.campaignId,
    createdAt,
    updatedAt: item.updatedAt,
    sync: pulledSyncState(item),
  }
  if (item.kind === 'creatureType' && item.creatureType) {
    const d = item.creatureType
    return {
      ...common,
      name: d.name,
      size: d.size,
      appearance: d.appearance,
      notes: d.notes,
      // Absent from servers older than the initiative list.
      initiativeModifier: d.initiativeModifier ?? 0,
      initiativeRollMode: d.initiativeRollMode ?? 'normal',
      archivedAt: d.archivedAt,
      recordVersion: LOCAL_CREATURE_TYPE_RECORD_VERSION,
    }
  }
  if (item.kind === 'battleMap' && item.map) {
    const d = item.map
    return {
      ...common,
      name: d.name,
      width: d.width,
      height: d.height,
      layout: d.layout,
      scene: d.scene,
      vibe: d.vibe,
      lighting: d.lighting,
      archivedAt: d.archivedAt,
      copiedFromMapId: d.copiedFromMapId,
      recordVersion: LOCAL_MAP_RECORD_VERSION,
    }
  }
  if (item.kind === 'encounter' && item.encounter) {
    const d = item.encounter
    return {
      ...common,
      battleMapId: d.battleMapId,
      name: d.name,
      status: d.status,
      archivedAt: d.archivedAt,
      tokens: d.tokens.map((token) => ({ ...token })),
      sessionId: d.sessionId,
      mapCopy: d.mapCopy,
      fog: d.fog ?? null,
      recordVersion: LOCAL_ENCOUNTER_RECORD_VERSION,
    }
  }
  throw new Error(`The server item ${item.id} (${item.kind}) has no data`)
}

/** The name an item shows under, from a local record or the server's copy. */
export function serverItemName(item: SyncServerItem): string {
  return (
    item.map?.name ?? item.creatureType?.name ?? item.encounter?.name ?? item.campaign?.name ?? ''
  )
}

// ---- Comparing copies --------------------------------------------------------------

const time = (value: string | null) => (value ? new Date(value).getTime() : null)

/** Sorted so the order the server happens to keep doesn't matter. */
function byKey<T>(items: readonly T[], key: (item: T) => string | number): T[] {
  return [...items].sort((a, b) => {
    const [ka, kb] = [key(a), key(b)]
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
}

/** Strings trimmed, undefined as null, object keys sorted: equal data gives equal JSON. */
function canonical(value: unknown): unknown {
  if (typeof value === 'string') return value.trim()
  if (value === undefined) return null
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    )
  }
  return value
}

/** The data a push item carries, in a form that compares equal for equal content. */
function comparable(
  item: Pick<SyncPushItem, 'kind' | 'campaign' | 'creatureType' | 'map' | 'encounter'>,
) {
  switch (item.kind) {
    case 'campaign':
      return canonical(item.campaign)
    case 'creatureType':
      return canonical(
        item.creatureType && {
          ...item.creatureType,
          archivedAt: time(item.creatureType.archivedAt),
        },
      )
    case 'battleMap': {
      const d = item.map
      if (!d) return null
      return canonical({
        ...d,
        archivedAt: time(d.archivedAt),
        layout: {
          ...d.layout,
          cells: byKey(d.layout.cells, (c) => c.y * 1000 + c.x),
          features: byKey(d.layout.features, (f) => f.id),
          entrances: byKey(d.layout.entrances, (e) => e.id).map((e) => ({
            ...e,
            cells: byKey(e.cells, (cell) => (cell[1] ?? 0) * 1000 + (cell[0] ?? 0)),
          })),
        },
      })
    }
    case 'encounter': {
      const d = item.encounter
      if (!d) return null
      return canonical({
        name: d.name,
        battleMapId: d.battleMapId,
        status: d.status,
        archivedAt: time(d.archivedAt),
        tokens: byKey(d.tokens, (t) => t.id),
        fog: d.fog ?? null,
      })
    }
  }
}

/** Whether the server's copy holds what the push carried (a retry after a lost answer). */
export function sameData(pushed: SyncPushItem, server: SyncServerItem): boolean {
  if (pushed.kind !== server.kind) return false
  return (
    JSON.stringify(comparable(pushed)) ===
    JSON.stringify(
      comparable({
        kind: server.kind,
        campaign: server.campaign,
        creatureType: server.creatureType,
        map: server.map,
        encounter: server.encounter,
      }),
    )
  )
}
