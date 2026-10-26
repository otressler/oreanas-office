import { beforeEach, describe, expect, it } from 'vitest'
import type { SyncPushRequest } from '../api/types'
import { editorMapOf } from '../editor/model'
import { saveMap } from '../editor/maps'
import { offlineDb, type OfflineDb } from '../offline/db'
import { newSyncState } from '../offline/sync'
import {
  refreshOpenedRecords,
  SYNC_VERSION_HEADER,
  syncBeforeStart,
  syncNow,
  withSyncLock,
} from './client'
import { pull } from './pull'
import {
  CAMPAIGN,
  NO_CARD,
  SESSION,
  fakeServer,
  seedCampaign,
  seedEncounter,
  seedMap,
  seedType,
  serverMap,
  type FakeServer,
} from './testing'
import {
  keepBoth,
  keepMine,
  renameCreatureType,
  saveAsNewDraft,
  switchToExistingCreatureType,
  takeServer,
} from './resolve'
import { resetSyncState, useSyncStore } from './state'

let db: OfflineDb
let server: FakeServer

beforeEach(async () => {
  resetSyncState()
  db = offlineDb('user-1')
  server = fakeServer()
  server.campaigns = [
    { id: CAMPAIGN, name: 'Die Rabenküste', myRole: 'dm', activeSession: null, ...NO_CARD },
  ]
  await seedCampaign(db)
})

const pushedKinds = () =>
  (server.push()!.body as SyncPushRequest).items.map((item) => `${item.kind}:${item.id}`)

describe('push', () => {
  it('sends campaigns, creature types, maps and encounters in that order, with the version header', async () => {
    const map = await seedMap(db)
    const type = await seedType(db)
    const encounter = await seedEncounter(db, { battleMapId: map.id })
    const campaign = await seedCampaign(db, { id: 'local-1', name: 'Neu', local: true })

    const result = await syncNow(db)

    expect(result).toEqual({ ok: true, issues: 0 })
    expect(pushedKinds()).toEqual([
      `campaign:${campaign.id}`,
      `creatureType:${type.id}`,
      `battleMap:${map.id}`,
      `encounter:${encounter.id}`,
    ])
    expect(server.push()!.headers.get(SYNC_VERSION_HEADER)).toBe('2')
  })

  it('never pushes active or ended encounters', async () => {
    const map = await seedMap(db, { synced: 1 })
    await seedEncounter(db, { battleMapId: map.id, status: 'active' })
    await seedEncounter(db, { battleMapId: map.id, status: 'ended' })

    await syncNow(db)

    expect(server.push()).toBeUndefined()
  })

  it('takes the server copy and clears the flag after a save', async () => {
    const map = await seedMap(db, { name: '  Klamm  ' })

    await syncNow(db)

    const stored = await db.maps.get(map.id)
    expect(stored).toMatchObject({ name: 'Klamm' })
    expect(stored!.sync).toMatchObject({
      baseVersion: 1,
      changed: false,
      issue: null,
      server: { updatedBy: 'Jennie' },
    })
  })

  it('keeps a map changed that was edited while the push ran', async () => {
    const map = await seedMap(db)
    server.onPush = async () => {
      await saveMap(db, map.id, { ...editorMapOf(map), name: 'Klamm, neu' })
    }

    await syncNow(db)

    const stored = await db.maps.get(map.id)
    expect(stored).toMatchObject({ name: 'Klamm, neu' })
    expect(stored!.sync).toMatchObject({ baseVersion: 1, changed: true, issue: null })

    // The next sync pushes the edit on top of version 1.
    server.onPush = null
    await syncNow(db)
    expect((await db.maps.get(map.id))!.sync).toMatchObject({ baseVersion: 2, changed: false })
  })

  it('treats a conflict whose server copy holds the pushed data as saved', async () => {
    const map = await seedMap(db, { name: 'Klamm', synced: 1 })
    await db.maps.update(map.id, {
      sync: { ...map.sync, baseVersion: 1, changed: true, editCount: 1 },
    })
    // A retry after a lost answer: the server already has version 2 with this data.
    const stored = serverMap(map.id, 2, { name: 'Klamm' })
    stored.map!.layout = map.layout
    server.put(stored)

    const result = await syncNow(db)

    expect(result.issues).toBe(0)
    expect((await db.maps.get(map.id))!.sync).toMatchObject({
      baseVersion: 2,
      changed: false,
      issue: null,
    })
  })

  it('stores a real conflict as an issue and keeps the local data', async () => {
    const map = await seedMap(db, { name: 'Meine Klamm', synced: 1 })
    await db.maps.update(map.id, { sync: { ...map.sync, changed: true, editCount: 1 } })
    server.put(serverMap(map.id, 2, { name: 'Ihre Klamm' }))

    const result = await syncNow(db)

    expect(result.issues).toBe(1)
    const stored = await db.maps.get(map.id)
    expect(stored).toMatchObject({ name: 'Meine Klamm' })
    expect(stored!.sync.changed).toBe(true)
    expect(stored!.sync.issue).toMatchObject({
      kind: 'conflict',
      server: { version: 2, updatedByDisplayName: 'Felix' },
    })
  })

  it('does not push a record again while its conflict waits', async () => {
    const map = await seedMap(db, { synced: 1 })
    await db.maps.update(map.id, { sync: { ...map.sync, changed: true, editCount: 1 } })
    server.put(serverMap(map.id, 2, { name: 'Andere' }))
    await syncNow(db)
    server.calls.length = 0

    await syncNow(db)

    expect(server.push()).toBeUndefined()
  })

  it('stores a rejection with its reason and what it depends on', async () => {
    const map = await seedMap(db)
    const encounter = await seedEncounter(db, { battleMapId: map.id })
    server.rejections.set(map.id, {
      error: { code: 'layoutInvalid' },
      problems: [{ code: 'cellOutside', item: { kind: 'cell', x: 20, y: 1 } }],
    })
    server.rejections.set(encounter.id, {
      error: { code: 'dependencyRejected' },
      dependsOnId: map.id,
    })

    const result = await syncNow(db)

    expect(result.issues).toBe(2)
    expect((await db.maps.get(map.id))!.sync).toMatchObject({
      changed: true,
      issue: {
        kind: 'rejected',
        error: { code: 'layoutInvalid' },
        problems: [{ code: 'cellOutside' }],
      },
    })
    expect((await db.encounters.get(encounter.id))!.sync.issue).toMatchObject({
      kind: 'rejected',
      dependsOnId: map.id,
    })
  })

  it('pushes a campaign made offline first, then lists the campaigns again', async () => {
    await seedCampaign(db, { id: 'local-1', name: '  Neu  ', local: true })
    const map = await seedMap(db, { campaignId: 'local-1' })

    await syncNow(db)

    expect(pushedKinds()).toEqual(['campaign:local-1', `battleMap:${map.id}`])
    expect(await db.campaigns.get('local-1')).toMatchObject({
      local: false,
      sync: null,
      name: 'Neu',
    })
    // The list that follows the push is what gives it its join code.
    const lists = server.calls.filter((call) => call.path === '/api/campaigns')
    expect(lists).toHaveLength(1)
    expect(useSyncStore.getState().campaignsCreated).toBe(1)
  })
})

describe('resolving a conflict', () => {
  async function conflicted() {
    const map = await seedMap(db, { name: 'Meine Klamm', synced: 1 })
    await db.maps.update(map.id, { sync: { ...map.sync, changed: true, editCount: 1 } })
    server.put(serverMap(map.id, 3, { name: 'Ihre Klamm' }))
    await syncNow(db)
    server.calls.length = 0
    return map
  }

  it('"Meine behalten" pushes again on top of the server version', async () => {
    const map = await conflicted()

    await keepMine(db, 'battleMap', map.id)
    expect((await db.maps.get(map.id))!.sync).toMatchObject({
      baseVersion: 3,
      changed: true,
      issue: null,
    })
    await syncNow(db)

    expect(await db.maps.get(map.id)).toMatchObject({ name: 'Meine Klamm' })
    expect(server.items.get(map.id)).toMatchObject({ version: 4, map: { name: 'Meine Klamm' } })
  })

  it('"Server-Version übernehmen" replaces the local record', async () => {
    const map = await conflicted()

    await takeServer(db, 'battleMap', map.id)

    const stored = await db.maps.get(map.id)
    expect(stored).toMatchObject({ name: 'Ihre Klamm' })
    expect(stored!.sync).toMatchObject({ baseVersion: 3, changed: false, issue: null })
  })

  it('"Beide behalten" saves the local copy as a new item and takes the server copy', async () => {
    const map = await conflicted()

    const copyId = await keepBoth(db, 'battleMap', map.id)

    expect(copyId).not.toBe(map.id)
    expect(await db.maps.get(map.id)).toMatchObject({ name: 'Ihre Klamm' })
    const copy = await db.maps.get(copyId!)
    expect(copy).toMatchObject({ name: 'Meine Klamm (Kopie)' })
    expect(copy!.sync).toMatchObject({ baseVersion: 0, changed: true, issue: null })
  })

  it('an encounter started on the server can only become a new draft or be discarded', async () => {
    const map = await seedMap(db, { synced: 1 })
    const encounter = await seedEncounter(db, {
      battleMapId: map.id,
      status: 'ready',
      tokens: [
        { id: 't1', creatureTypeId: 'type-1', label: 'Goblin 1', x: 1, y: 1, size: 'small' },
      ],
      sync: { ...newSyncState(), baseVersion: 1, editCount: 1 },
    })
    server.put({
      id: encounter.id,
      kind: 'encounter',
      campaignId: CAMPAIGN,
      version: 2,
      updatedAt: '2026-10-14T09:00:00.000Z',
      updatedByDisplayName: 'Jennie',
      campaign: null,
      creatureType: null,
      map: null,
      encounter: {
        name: 'Hinterhalt',
        battleMapId: map.id,
        status: 'active',
        archivedAt: null,
        tokens: [],
        sessionId: 's1',
        mapCopy: null,
      },
    })
    await syncNow(db)
    expect((await db.encounters.get(encounter.id))!.sync.issue).toMatchObject({ kind: 'conflict' })

    const draftId = await saveAsNewDraft(db, encounter.id)

    const draft = await db.encounters.get(draftId!)
    // It stays in its session; a push says so if that session has ended.
    expect(draft).toMatchObject({ status: 'draft', sessionId: SESSION })
    expect(draft!.tokens[0]!.id).not.toBe('t1')
    expect(draft!.sync).toMatchObject({ baseVersion: 0, changed: true })
    expect(await db.encounters.get(encounter.id)).toMatchObject({
      status: 'active',
      sessionId: 's1',
    })
  })
})

describe('a creature type name that is taken', () => {
  it('"Vorhandene Art verwenden" switches the tokens and removes the local type', async () => {
    const map = await seedMap(db, { synced: 1 })
    const type = await seedType(db)
    const encounter = await seedEncounter(db, {
      battleMapId: map.id,
      tokens: [
        { id: 't1', creatureTypeId: type.id, label: 'Goblin 1', x: 1, y: 1, size: 'small' },
        { id: 't2', creatureTypeId: 'other', label: 'Ork', x: 3, y: 1, size: 'medium' },
      ],
      sync: { ...newSyncState(), baseVersion: 1, changed: false, editCount: 0 },
    })

    await switchToExistingCreatureType(db, type.id, 'existing-1')

    expect(await db.creatureTypes.get(type.id)).toBeUndefined()
    const stored = await db.encounters.get(encounter.id)
    expect(stored!.tokens.map((token) => token.creatureTypeId)).toEqual(['existing-1', 'other'])
    expect(stored!.sync).toMatchObject({ changed: true, editCount: 1 })
  })

  it('"Umbenennen" clears the rejection and pushes the new name', async () => {
    const type = await seedType(db)
    server.rejections.set(type.id, {
      error: { code: 'creatureTypeNameTaken' },
      existingCreatureTypeId: 'existing-1',
    })
    await syncNow(db)
    expect((await db.creatureTypes.get(type.id))!.sync.issue).toMatchObject({ kind: 'rejected' })

    expect(await renameCreatureType(db, type.id, ' Goblin-Späher ')).toBe(true)
    server.rejections.clear()
    await syncNow(db)

    expect(server.items.get(type.id)!.creatureType!.name).toBe('Goblin-Späher')
    expect((await db.creatureTypes.get(type.id))!.sync).toMatchObject({
      changed: false,
      issue: null,
    })
  })
})

describe('pull', () => {
  it('writes new and newer items as synced records', async () => {
    const known = await seedMap(db, { name: 'Alt', synced: 1 })
    server.put(serverMap(known.id, 2, { name: 'Neu' }))
    server.put(serverMap('new-map', 1, { name: 'Von woanders' }))

    await pull(db)

    expect(await db.maps.get(known.id)).toMatchObject({ name: 'Neu' })
    const created = await db.maps.get('new-map')
    expect(created).toMatchObject({ name: 'Von woanders', campaignId: CAMPAIGN })
    expect(created!.sync).toMatchObject({ baseVersion: 1, changed: false })
    expect((await db.meta.get(`lastPull:${CAMPAIGN}`))?.value).toEqual(expect.any(String))
  })

  it('fetches only what differs', async () => {
    const same = await seedMap(db, { synced: 2 })
    server.put(serverMap(same.id, 2))

    await pull(db)

    expect(server.calls.some((call) => call.path.endsWith('/items'))).toBe(false)
  })

  it('never overwrites a record with unsynced changes', async () => {
    const map = await seedMap(db, { name: 'Meine', synced: 1 })
    await db.maps.update(map.id, { sync: { ...map.sync, changed: true, editCount: 1 } })
    server.put(serverMap(map.id, 5, { name: 'Ihre' }))

    await pull(db)

    expect(await db.maps.get(map.id)).toMatchObject({ name: 'Meine' })
  })

  it('leaves records an editor holds alone', async () => {
    const map = await seedMap(db, { name: 'Alt', synced: 1 })
    server.put(serverMap(map.id, 2, { name: 'Neu' }))

    await pull(db, { held: new Set([map.id]) })

    expect(await db.maps.get(map.id)).toMatchObject({ name: 'Alt' })
  })

  describe('records an editor has just opened', () => {
    it('takes the newer server version when the device and the editor changed nothing', async () => {
      const map = await seedMap(db, { name: 'Alt', synced: 1 })
      server.put(serverMap(map.id, 2, { name: 'Neu' }))

      const taken = await refreshOpenedRecords(db, CAMPAIGN, [map.id], () => true)

      expect(taken).toBe(true)
      expect(await db.maps.get(map.id)).toMatchObject({ name: 'Neu' })
      expect((await db.maps.get(map.id))!.sync).toMatchObject({ baseVersion: 2, changed: false })
    })

    it('leaves the record alone once the editor holds edits', async () => {
      const map = await seedMap(db, { name: 'Alt', synced: 1 })
      server.put(serverMap(map.id, 2, { name: 'Neu' }))

      expect(await refreshOpenedRecords(db, CAMPAIGN, [map.id], () => false)).toBe(false)

      expect(await db.maps.get(map.id)).toMatchObject({ name: 'Alt' })
    })

    it('leaves a record the device changed to the next push', async () => {
      const map = await seedMap(db, { name: 'Meine', synced: 1 })
      await db.maps.update(map.id, { sync: { ...map.sync, changed: true, editCount: 1 } })
      server.put(serverMap(map.id, 2, { name: 'Ihre' }))

      expect(await refreshOpenedRecords(db, CAMPAIGN, [map.id], () => true)).toBe(false)

      expect(await db.maps.get(map.id)).toMatchObject({ name: 'Meine' })
    })

    it('does nothing without a connection or when the version is the same', async () => {
      const map = await seedMap(db, { name: 'Alt', synced: 2 })
      server.put(serverMap(map.id, 2, { name: 'Alt' }))

      expect(await refreshOpenedRecords(db, CAMPAIGN, [map.id], () => true)).toBe(false)
      expect(server.calls.some((call) => call.path.endsWith('/items'))).toBe(false)

      server.offline = true
      expect(await refreshOpenedRecords(db, CAMPAIGN, [map.id], () => true)).toBe(false)
    })
  })

  it('drops synced items the server no longer lists and flags changed ones', async () => {
    const synced = await seedMap(db, { synced: 1 })
    const changed = await seedMap(db, { synced: 1 })
    await db.maps.update(changed.id, { sync: { ...changed.sync, changed: true, editCount: 1 } })
    const fresh = await seedMap(db)

    await pull(db)

    expect(await db.maps.get(synced.id)).toBeUndefined()
    expect((await db.maps.get(changed.id))!.sync.issue).toEqual({ kind: 'vanished' })
    // Never seen by the server: still waiting for its push, not vanished.
    expect((await db.maps.get(fresh.id))!.sync.issue).toBeNull()
  })

  it('treats a 403 on a campaign like every item gone', async () => {
    const synced = await seedMap(db, { synced: 1 })
    const changed = await seedMap(db, { synced: 1 })
    await db.maps.update(changed.id, { sync: { ...changed.sync, changed: true, editCount: 1 } })
    server.forbidden.add(CAMPAIGN)
    server.put(serverMap(synced.id, 1))

    await pull(db)

    expect(await db.maps.get(synced.id)).toBeUndefined()
    expect((await db.maps.get(changed.id))!.sync.issue).toEqual({ kind: 'vanished' })
  })

  it('pulls only the campaign list as a player', async () => {
    server.campaigns = [
      { id: CAMPAIGN, name: 'Die Rabenküste', myRole: 'player', activeSession: null, ...NO_CARD },
    ]
    server.put(serverMap('secret-map', 1))

    await pull(db)

    expect(server.calls.map((call) => call.path)).toEqual(['/api/campaigns'])
    expect(await db.maps.get('secret-map')).toBeUndefined()
    expect(await db.campaigns.get(CAMPAIGN)).toMatchObject({ myRole: 'player' })
  })
})

describe('one sync at a time', () => {
  it('the lock lets only one job run', async () => {
    const order: string[] = []
    const job = (name: string) => async () => {
      order.push(`${name} start`)
      await new Promise((resolve) => setTimeout(resolve, 10))
      order.push(`${name} end`)
    }

    await Promise.all([withSyncLock('u', job('a')), withSyncLock('u', job('b'))])

    expect(order).toEqual(['a start', 'a end', 'b start', 'b end'])
  })

  it('requests during a sync share one more run', async () => {
    await seedMap(db)
    let release!: () => void
    server.onPush = () => new Promise<void>((resolve) => (release = resolve))

    const first = syncNow(db)
    await vi_waitFor(() => server.push() !== undefined)
    const second = syncNow(db)
    const third = syncNow(db)
    server.onPush = null
    release()
    await Promise.all([first, second, third])

    // One run for the first request, one for the other two.
    expect(server.calls.filter((call) => call.path === '/api/campaigns')).toHaveLength(2)
  })

  it('opening the editor only pulls', async () => {
    await seedMap(db)

    await syncNow(db, { reason: 'editorOpen' })

    expect(server.push()).toBeUndefined()
    expect(server.calls.some((call) => call.path === '/api/campaigns')).toBe(true)
  })
})

describe('when the server stops the sync', () => {
  it('426 means the app is outdated and keeps the data', async () => {
    const map = await seedMap(db)
    server.syncStatus = 426

    const result = await syncNow(db)

    expect(result.ok).toBe(false)
    expect(useSyncStore.getState().blocked).toBe('outdated')
    expect(await db.maps.get(map.id)).toBeDefined()
    // Nothing more is tried until the page reloads.
    server.calls.length = 0
    await syncNow(db)
    expect(server.calls).toHaveLength(0)
  })

  it('401 asks to sign in again and keeps the data', async () => {
    const map = await seedMap(db)
    server.syncStatus = 401

    await syncNow(db)

    expect(useSyncStore.getState().blocked).toBe('signedOut')
    expect((await db.maps.get(map.id))!.sync.changed).toBe(true)
  })

  it('no connection is quiet and leaves the changes', async () => {
    const map = await seedMap(db)
    server.offline = true

    const result = await syncNow(db, { reason: 'leaveEditor' })

    expect(result.ok).toBe(false)
    expect(useSyncStore.getState()).toMatchObject({ offline: true, failed: false, blocked: null })
    expect((await db.maps.get(map.id))!.sync.changed).toBe(true)
  })
})

describe('before starting an encounter', () => {
  it('pushes the encounter and what it needs, nothing else', async () => {
    const map = await seedMap(db)
    const type = await seedType(db)
    const other = await seedMap(db, { name: 'Andere Karte' })
    const encounter = await seedEncounter(db, {
      battleMapId: map.id,
      status: 'ready',
      tokens: [{ id: 't1', creatureTypeId: type.id, label: 'Goblin 1', x: 1, y: 1, size: 'small' }],
    })

    const result = await syncBeforeStart(db, encounter.id)

    expect(result).toBe('ready')
    expect(server.pushedIds()).toEqual([type.id, map.id, encounter.id])
    expect(server.pushedIds()).not.toContain(other.id)
  })

  it('is blocked while a needed item is rejected', async () => {
    const map = await seedMap(db)
    const encounter = await seedEncounter(db, { battleMapId: map.id })
    server.rejections.set(map.id, { error: { code: 'layoutInvalid' } })

    expect(await syncBeforeStart(db, encounter.id)).toBe('blocked')
  })

  it('is blocked by a conflict on the encounter', async () => {
    const map = await seedMap(db, { synced: 1 })
    const encounter = await seedEncounter(db, {
      battleMapId: map.id,
      sync: { ...newSyncState(), baseVersion: 1 },
    })
    server.put({
      ...serverMap(encounter.id, 2),
      kind: 'encounter',
      map: null,
      encounter: {
        name: 'Andere',
        battleMapId: map.id,
        status: 'ready',
        archivedAt: null,
        tokens: [],
        sessionId: SESSION,
        mapCopy: null,
      },
    })

    expect(await syncBeforeStart(db, encounter.id)).toBe('blocked')
  })

  it('says offline without a connection', async () => {
    const map = await seedMap(db)
    const encounter = await seedEncounter(db, { battleMapId: map.id })
    server.offline = true

    expect(await syncBeforeStart(db, encounter.id)).toBe('offline')
  })
})

async function vi_waitFor(condition: () => boolean) {
  for (let i = 0; i < 200 && !condition(); i++)
    await new Promise((resolve) => setTimeout(resolve, 5))
  expect(condition()).toBe(true)
}
