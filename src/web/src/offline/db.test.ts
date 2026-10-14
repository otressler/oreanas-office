import { Dexie } from 'dexie'
import { describe, expect, it } from 'vitest'
import { emptyMap } from '../editor/model'
import { saveCampaignCopies } from './campaigns'
import { OfflineDb, offlineDb, offlineDbName } from './db'
import { newSyncState } from './sync'

describe('the offline database', () => {
  it('upgrades a stage 5 database: maps and campaigns get the sync fields', async () => {
    const v1 = new Dexie(offlineDbName('u1'))
    v1.version(1).stores({ maps: 'id, campaignId', campaigns: 'id' })
    await v1.table('maps').add({
      id: 'm1',
      campaignId: 'c1',
      ...emptyMap('Klamm', 4, 4),
      copiedFromMapId: null,
      archivedAt: null,
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
      sync: { baseVersion: 3, changed: true, editCount: 2 },
      recordVersion: 1,
    })
    await v1.table('campaigns').add({ id: 'c1', name: 'Kampagne', myRole: 'dm', savedAt: 'x' })
    v1.close()

    const db = new OfflineDb('u1')
    expect((await db.maps.get('m1'))?.sync).toEqual({
      baseVersion: 3,
      changed: true,
      editCount: 2,
      issue: null,
      server: null,
    })
    expect(await db.campaigns.get('c1')).toMatchObject({ local: false, sync: null })
    expect([
      await db.creatureTypes.count(),
      await db.encounters.count(),
      await db.meta.count(),
    ]).toEqual([0, 0, 0])
    db.close()
  })

  it('keeps campaigns made on this device when the server list is saved', async () => {
    const db = offlineDb('u1')
    await db.campaigns.bulkAdd([
      { id: 'local', name: 'Neu', myRole: 'dm', savedAt: 'x', local: true, sync: newSyncState() },
      { id: 'old', name: 'Alt', myRole: 'dm', savedAt: 'x', local: false, sync: null },
    ])

    await saveCampaignCopies(db, [{ id: 'new', name: 'Neu vom Server', myRole: 'player' }] as never)

    expect((await db.campaigns.toArray()).map((c) => c.id).sort()).toEqual(['local', 'new'])
  })
})
