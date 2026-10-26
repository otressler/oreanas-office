import { beforeEach, describe, expect, it } from 'vitest'
import type { SyncPushRequest } from '../api/types'
import { ApiRequestError } from '../api/errors'
import { offlineDb, type OfflineDb } from '../offline/db'
import { deleteMap } from './client'
import {
  CAMPAIGN,
  NO_CARD,
  fakeServer,
  pulledSyncState,
  seedCampaign,
  seedEncounter,
  seedMap,
  serverMap,
  type FakeServer,
} from './testing'
import { resetSyncState } from './state'

// Deleting an archived map (knowledge/domain/battle-map.md, "Deleting").
let db: OfflineDb
let server: FakeServer

const ARCHIVED = '2026-10-20T10:00:00.000Z'

beforeEach(async () => {
  resetSyncState()
  db = offlineDb('user-1')
  server = fakeServer()
  server.campaigns = [
    { id: CAMPAIGN, name: 'Die Rabenküste', myRole: 'dm', activeSession: null, ...NO_CARD },
  ]
  await seedCampaign(db)
})

/** An archived map that the server holds as this device does. */
async function syncedArchivedMap() {
  const item = serverMap('m0000000-0000-0000-0000-000000000001', 2)
  item.map!.archivedAt = ARCHIVED
  server.put(item)
  return seedMap(db, { id: item.id, archivedAt: ARCHIVED, sync: pulledSyncState(item) })
}

const deletes = () => server.calls.filter((call) => call.method === 'DELETE')

describe('deleteMap', () => {
  it('deletes a map the server never saw on this device alone, also offline', async () => {
    const map = await seedMap(db, { archivedAt: ARCHIVED })
    const encounter = await seedEncounter(db, { battleMapId: map.id })
    const other = await seedEncounter(db, { battleMapId: 'another-map' })
    server.offline = true

    expect(await deleteMap(db, map.id)).toBe('deleted')

    expect(await db.maps.get(map.id)).toBeUndefined()
    expect(await db.encounters.get(encounter.id)).toBeUndefined()
    expect(await db.encounters.get(other.id)).toBeDefined()
    expect(server.calls).toHaveLength(0)
  })

  it('asks the server, then drops the map and its encounters here', async () => {
    const map = await syncedArchivedMap()
    const encounter = await seedEncounter(db, { battleMapId: map.id })

    expect(await deleteMap(db, map.id)).toBe('deleted')

    expect(deletes().map((call) => call.path)).toEqual([
      `/api/campaigns/${CAMPAIGN}/maps/${map.id}`,
    ])
    expect(server.items.has(map.id)).toBe(false)
    expect(await db.maps.get(map.id)).toBeUndefined()
    expect(await db.encounters.get(encounter.id)).toBeUndefined()
  })

  it('pushes an archive the server doesn’t have yet before deleting', async () => {
    const item = server.put(serverMap('m0000000-0000-0000-0000-000000000002', 1))
    const map = await seedMap(db, {
      id: item.id,
      archivedAt: ARCHIVED,
      sync: { ...pulledSyncState(item), changed: true, editCount: 1 },
    })

    expect(await deleteMap(db, map.id)).toBe('deleted')

    const pushed = (server.push()!.body as SyncPushRequest).items
    expect(pushed.map((i) => [i.id, i.map?.archivedAt])).toEqual([[map.id, ARCHIVED]])
    expect(server.calls.findIndex((c) => c.method === 'DELETE')).toBeGreaterThan(
      server.calls.findIndex((c) => c.path === '/api/sync/push'),
    )
    expect(await db.maps.get(map.id)).toBeUndefined()
  })

  it('stops when the map’s changes can’t be pushed', async () => {
    const item = server.put(serverMap('m0000000-0000-0000-0000-000000000003', 3))
    const map = await seedMap(db, {
      id: item.id,
      archivedAt: ARCHIVED,
      sync: { ...pulledSyncState(item), baseVersion: 2, changed: true, editCount: 1 },
    })

    expect(await deleteMap(db, map.id)).toBe('blocked')

    expect(deletes()).toHaveLength(0)
    expect(await db.maps.get(map.id)).toBeDefined()
  })

  it('needs a connection for a map the server has', async () => {
    const map = await syncedArchivedMap()
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false })
    try {
      expect(await deleteMap(db, map.id)).toBe('offline')
    } finally {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: true })
    }
    expect(server.calls).toHaveLength(0)
    expect(await db.maps.get(map.id)).toBeDefined()
  })

  it('keeps everything when the server says a played fight uses the map', async () => {
    const map = await syncedArchivedMap()
    const fight = await seedEncounter(db, { battleMapId: map.id, status: 'ended' })
    server.put({
      ...serverMap(fight.id, 1),
      kind: 'encounter',
      map: null,
      encounter: {
        name: fight.name,
        battleMapId: map.id,
        status: 'ended',
        archivedAt: null,
        tokens: [],
        sessionId: fight.sessionId,
        mapCopy: null,
      },
    })

    const failure = await deleteMap(db, map.id).catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(ApiRequestError)
    expect((failure as ApiRequestError).code).toBe('mapPlayed')
    expect(await db.maps.get(map.id)).toBeDefined()
    expect(await db.encounters.get(fight.id)).toBeDefined()
  })

  it('takes a map the server no longer has as deleted', async () => {
    const map = await syncedArchivedMap()
    server.items.delete(map.id)

    expect(await deleteMap(db, map.id)).toBe('deleted')

    expect(deletes()).toHaveLength(1)
    expect(await db.maps.get(map.id)).toBeUndefined()
  })
})
