import { beforeEach, describe, expect, it } from 'vitest'
import { offlineDb, type OfflineDb } from '../offline/db'
import { de } from '../text/de'
import { syncThenStart } from './start'
import { CAMPAIGN, fakeServer, seedCampaign, seedEncounter, seedMap, serverMap } from './testing'
import { resetSyncState } from './state'
import type { FakeServer } from './testing'

let db: OfflineDb
let server: FakeServer

beforeEach(async () => {
  resetSyncState()
  db = offlineDb('user-1')
  server = fakeServer()
  server.campaigns = [{ id: CAMPAIGN, name: 'Die Rabenküste', myRole: 'dm', activeSession: null }]
  await seedCampaign(db)
})

describe('syncThenStart', () => {
  it('goes on without a sync for an encounter this device does not have', async () => {
    expect(await syncThenStart(db, 'elsewhere')).toEqual({ proceed: true, message: null })
    expect(await syncThenStart(null, 'elsewhere')).toEqual({ proceed: true, message: null })
    expect(server.calls).toEqual([])
  })

  it('pushes a local encounter first, then goes on', async () => {
    const map = await seedMap(db)
    const encounter = await seedEncounter(db, { battleMapId: map.id, status: 'ready' })

    expect(await syncThenStart(db, encounter.id)).toEqual({ proceed: true, message: null })
    expect(server.pushedIds()).toContain(encounter.id)
  })

  it('stops on a conflict', async () => {
    const map = await seedMap(db, { synced: 1 })
    await db.maps.update(map.id, { sync: { ...map.sync, changed: true, editCount: 1 } })
    server.put(serverMap(map.id, 3, { name: 'Anderswo geändert' }))
    const encounter = await seedEncounter(db, { battleMapId: map.id, status: 'ready' })

    expect(await syncThenStart(db, encounter.id)).toEqual({
      proceed: false,
      message: de.encounterEditor.startBlocked,
    })
  })

  it('stops without a connection', async () => {
    const map = await seedMap(db)
    const encounter = await seedEncounter(db, { battleMapId: map.id, status: 'ready' })
    server.offline = true

    expect(await syncThenStart(db, encounter.id)).toEqual({
      proceed: false,
      message: de.encounterEditor.startOffline,
    })
  })
})
