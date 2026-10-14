// What the DM can do about a conflict or a rejection (knowledge/decisions/offline-prep-pwa.md,
// "Conflicts" and "Rejections"). Nothing here is merged and nothing is deleted without the
// server holding a copy: each choice leaves a record per version the DM kept.
import type { SyncServerItem } from '../api/types'
import { limits } from '../lib/limits'
import type { OfflineDb } from '../offline/db'
import type { LocalCreatureType, LocalEncounter } from '../offline/model'
import { markChanged, newSyncState, type SyncState } from '../offline/sync'
import { de } from '../text/de'
import { itemTable, recordFromServer, type ItemKind, type ItemRecord } from './records'

const now = () => new Date().toISOString()

/** The longest name per kind (the server's limits). */
const NAME_LIMIT: Record<ItemKind, number> = {
  battleMap: limits.mapName,
  creatureType: 40,
  encounter: 80,
}

/** "<Name> (Kopie)", shortened so it stays within the name limit. */
export function copyName(name: string, max: number): string {
  const full = de.sync.copyName(name)
  if (full.length <= max) return full
  return de.sync.copyName(name.slice(0, max - (full.length - name.length)).trimEnd())
}

/** The record's conflict, or undefined when it has none. */
function conflictOf(record: ItemRecord | undefined): SyncServerItem | undefined {
  return record?.sync.issue?.kind === 'conflict' ? record.sync.issue.server : undefined
}

/** True for a server copy that is an encounter which started or ended there. */
export function startedOnServer(server: SyncServerItem): boolean {
  return (
    server.kind === 'encounter' &&
    (server.encounter?.status === 'active' || server.encounter?.status === 'ended')
  )
}

/**
 * "Meine behalten": the local copy goes on top of the server's version. The caller syncs
 * afterwards.
 */
export async function keepMine(db: OfflineDb, kind: ItemKind, id: string): Promise<void> {
  const table = itemTable(db, kind)
  await db.transaction('rw', table, async () => {
    const record = await table.get(id)
    const server = conflictOf(record)
    if (!record || !server) return
    const sync: SyncState = {
      ...markChanged(record.sync),
      baseVersion: server.version,
      issue: null,
      server: { updatedAt: server.updatedAt, updatedBy: server.updatedByDisplayName ?? null },
    }
    await table.put({ ...record, sync })
  })
}

/** "Server-Version übernehmen" and "Verwerfen": the local changes are thrown away. */
export async function takeServer(db: OfflineDb, kind: ItemKind, id: string): Promise<void> {
  const table = itemTable(db, kind)
  await db.transaction('rw', table, async () => {
    const record = await table.get(id)
    const server = conflictOf(record)
    if (!record || !server) return
    await table.put(recordFromServer(server, record))
  })
}

/** A copy of the record under a new id as a new item that was never synced. */
function asNewItem(record: ItemRecord, fresh: Partial<LocalEncounter>): ItemRecord {
  const time = now()
  return {
    ...structuredClone(record),
    ...fresh,
    id: crypto.randomUUID(),
    createdAt: time,
    updatedAt: time,
    sync: newSyncState(),
  } as ItemRecord
}

function withNewTokenIds(record: LocalEncounter): LocalEncounter['tokens'] {
  return record.tokens.map((token) => ({ ...token, id: crypto.randomUUID() }))
}

/**
 * "Beide behalten": the local copy becomes a new item named "… (Kopie)", the original takes
 * the server's version. Returns the id of the new item.
 */
export async function keepBoth(db: OfflineDb, kind: ItemKind, id: string): Promise<string | null> {
  const table = itemTable(db, kind)
  return db.transaction('rw', table, async () => {
    const record = await table.get(id)
    const server = conflictOf(record)
    if (!record || !server) return null
    const fresh: Partial<LocalEncounter> = { name: copyName(record.name, NAME_LIMIT[kind]) }
    if (kind === 'encounter') fresh.tokens = withNewTokenIds(record as LocalEncounter)
    const copy = asNewItem(record, fresh)
    await table.put(copy)
    await table.put(recordFromServer(server, record))
    return copy.id
  })
}

/**
 * "Als neuen Entwurf speichern": the encounter started or ended on the server meanwhile, so
 * the local version becomes a new draft (new id, new token ids) and the original takes the
 * server's version. Returns the id of the draft.
 */
export async function saveAsNewDraft(db: OfflineDb, id: string): Promise<string | null> {
  return db.transaction('rw', db.encounters, async () => {
    const record = await db.encounters.get(id)
    const server = conflictOf(record)
    if (!record || !server) return null
    const draft = asNewItem(record, {
      status: 'draft',
      tokens: withNewTokenIds(record),
      sessionId: null,
      mapCopy: null,
    })
    await db.encounters.put(draft as LocalEncounter)
    await db.encounters.put(recordFromServer(server, record) as LocalEncounter)
    return draft.id
  })
}

/**
 * "Server-Version übernehmen" for a rejected item: the server has a copy (an item pushed
 * before), so the local changes are thrown away for it.
 */
export async function takeServerAfterRejection(
  db: OfflineDb,
  kind: ItemKind,
  id: string,
  server: SyncServerItem,
): Promise<void> {
  const table = itemTable(db, kind)
  await db.transaction('rw', table, async () => {
    const record = await table.get(id)
    if (record) await table.put(recordFromServer(server, record))
  })
}

/**
 * "Vorhandene Art verwenden": every token of a draft or ready encounter that uses the local
 * type switches to the type the server already has, and the local type is removed. It never
 * reached the server, so nothing else knows it.
 */
export async function switchToExistingCreatureType(
  db: OfflineDb,
  localTypeId: string,
  existingTypeId: string,
): Promise<void> {
  await db.transaction('rw', db.creatureTypes, db.encounters, async () => {
    const encounters = await db.encounters
      .filter(
        (e) =>
          (e.status === 'draft' || e.status === 'ready') &&
          e.tokens.some((token) => token.creatureTypeId === localTypeId),
      )
      .toArray()
    for (const encounter of encounters) {
      await db.encounters.put({
        ...encounter,
        tokens: encounter.tokens.map((token) =>
          token.creatureTypeId === localTypeId
            ? { ...token, creatureTypeId: existingTypeId }
            : token,
        ),
        updatedAt: now(),
        sync: markChanged(encounter.sync),
      })
    }
    await db.creatureTypes.delete(localTypeId)
  })
}

/** "Umbenennen": a new name for the creature type; the next sync pushes it again. */
export async function renameCreatureType(
  db: OfflineDb,
  id: string,
  name: string,
): Promise<boolean> {
  const trimmed = name.trim()
  if (!trimmed || trimmed.length > NAME_LIMIT.creatureType) return false
  return db.transaction('rw', db.creatureTypes, async () => {
    const record = await db.creatureTypes.get(id)
    if (!record) return false
    const renamed: LocalCreatureType = {
      ...record,
      name: trimmed,
      updatedAt: now(),
      sync: { ...markChanged(record.sync), issue: null },
    }
    await db.creatureTypes.put(renamed)
    return true
  })
}
