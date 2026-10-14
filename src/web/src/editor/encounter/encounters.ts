// Encounters in the browser (knowledge/domain/encounter.md): prepared on a map in the
// editor. Every change marks the encounter as not synced; nothing is ever deleted.
// Devices change only draft and ready encounters; active and ended ones come from the
// server and stay as they are (knowledge/decisions/offline-prep-pwa.md).
import { useLiveQuery } from 'dexie-react-hooks'
import type { OfflineDb } from '../../offline/db'
import { LOCAL_ENCOUNTER_RECORD_VERSION, type LocalEncounter } from '../../offline/model'
import { markChanged, newSyncState } from '../../offline/sync'
import type { LocalMap } from '../model'
import type { EncounterDoc } from './tokens'

const now = () => new Date().toISOString()

const collator = new Intl.Collator('de-DE', { numeric: true })

/** The map's encounters, archived ones included, by name. */
export async function listEncounters(db: OfflineDb, mapId: string): Promise<LocalEncounter[]> {
  const encounters = await db.encounters.where('battleMapId').equals(mapId).toArray()
  return encounters.sort(
    (a, b) => collator.compare(a.name, b.name) || a.createdAt.localeCompare(b.createdAt),
  )
}

/** The map's encounters, live; undefined while loading. */
export function useEncounters(db: OfflineDb, mapId: string): LocalEncounter[] | undefined {
  return useLiveQuery(() => listEncounters(db, mapId), [db, mapId])
}

export function getEncounter(db: OfflineDb, id: string): Promise<LocalEncounter | undefined> {
  return db.encounters.get(id)
}

/** A new draft encounter on the map, named after it, with an id made here. */
export async function createEncounter(
  db: OfflineDb,
  map: Pick<LocalMap, 'id' | 'campaignId' | 'name'>,
): Promise<LocalEncounter> {
  const time = now()
  const record: LocalEncounter = {
    id: crypto.randomUUID(),
    campaignId: map.campaignId,
    battleMapId: map.id,
    name: map.name,
    status: 'draft',
    archivedAt: null,
    tokens: [],
    sessionId: null,
    mapCopy: null,
    createdAt: time,
    updatedAt: time,
    sync: newSyncState(),
    recordVersion: LOCAL_ENCOUNTER_RECORD_VERSION,
  }
  await db.encounters.add(record)
  return record
}

/**
 * Saves the editor's state of an encounter. Returns false when the encounter is gone or
 * has started (the server owns it then).
 */
export async function saveEncounter(
  db: OfflineDb,
  id: string,
  doc: EncounterDoc,
): Promise<boolean> {
  return db.transaction('rw', db.encounters, async () => {
    const stored = await db.encounters.get(id)
    if (!stored || !editable(stored)) return false
    await db.encounters.put({
      ...stored,
      ...structuredClone(doc),
      updatedAt: now(),
      sync: markChanged(stored.sync),
    })
    return true
  })
}

/** Archives an encounter, or brings it back. */
export async function setEncounterArchived(
  db: OfflineDb,
  id: string,
  archived: boolean,
): Promise<void> {
  await db.transaction('rw', db.encounters, async () => {
    const stored = await db.encounters.get(id)
    if (!stored || !editable(stored) || (stored.archivedAt !== null) === archived) return
    await db.encounters.put({
      ...stored,
      archivedAt: archived ? now() : null,
      updatedAt: now(),
      sync: markChanged(stored.sync),
    })
  })
}

/** Draft and ready encounters can be changed on a device. */
export function editable(encounter: Pick<LocalEncounter, 'status'>): boolean {
  return encounter.status === 'draft' || encounter.status === 'ready'
}
