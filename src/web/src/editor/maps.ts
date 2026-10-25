// Battle maps in the browser (knowledge/domain/battle-map.md, "Map list, archive and
// store"). Every change marks the map as not synced. Deleting needs the server, so it is in
// the sync client (deleteMap).
import type { OfflineDb } from '../offline/db'
import { markChanged, newSyncState } from '../offline/sync'
import { LOCAL_MAP_RECORD_VERSION, type EditorMap, type LocalMap } from './model'

const now = () => new Date().toISOString()

/** The campaign's maps, archived ones included, by name. */
export async function listMaps(db: OfflineDb, campaignId: string): Promise<LocalMap[]> {
  const maps = await db.maps.where('campaignId').equals(campaignId).toArray()
  const byName = new Intl.Collator('de-DE', { numeric: true }).compare
  return maps.sort((a, b) => byName(a.name, b.name) || a.createdAt.localeCompare(b.createdAt))
}

export function getMap(db: OfflineDb, id: string): Promise<LocalMap | undefined> {
  return db.maps.get(id)
}

/** A new map in the campaign, with an id made here. */
export async function createMap(
  db: OfflineDb,
  campaignId: string,
  map: EditorMap,
  copiedFromMapId: string | null = null,
): Promise<LocalMap> {
  const time = now()
  const record: LocalMap = {
    ...structuredClone(map),
    id: crypto.randomUUID(),
    campaignId,
    copiedFromMapId,
    archivedAt: null,
    createdAt: time,
    updatedAt: time,
    sync: newSyncState(),
    recordVersion: LOCAL_MAP_RECORD_VERSION,
  }
  await db.maps.add(record)
  return record
}

/** Saves the editor's state of a map. Returns false when the map is gone. */
export async function saveMap(db: OfflineDb, id: string, map: EditorMap): Promise<boolean> {
  return db.transaction('rw', db.maps, async () => {
    const stored = await db.maps.get(id)
    if (!stored) return false
    await db.maps.put({ ...stored, ...structuredClone(map), ...changed(stored) })
    return true
  })
}

/** A copy in the same campaign that remembers where it came from. */
export async function duplicateMap(db: OfflineDb, id: string, name: string): Promise<LocalMap> {
  const source = await db.maps.get(id)
  if (!source) throw new Error(`Map ${id} not found`)
  const { name: _, width, height, layout, scene, vibe, lighting } = source
  return createMap(
    db,
    source.campaignId,
    { name, width, height, layout, scene, vibe, lighting },
    id,
  )
}

/** Archives a map, or brings it back. */
export async function setArchived(db: OfflineDb, id: string, archived: boolean): Promise<void> {
  await db.transaction('rw', db.maps, async () => {
    const stored = await db.maps.get(id)
    if (!stored || (stored.archivedAt !== null) === archived) return
    await db.maps.put({ ...stored, archivedAt: archived ? now() : null, ...changed(stored) })
  })
}

function changed(stored: LocalMap): Pick<LocalMap, 'updatedAt' | 'sync'> {
  return {
    updatedAt: now(),
    sync: markChanged(stored.sync),
  }
}
