// Fog and hidden creatures prepared offline (knowledge/features/fog-of-war.md, "Preparing"):
// they survive the editor's save, reach the sync's push item and come back from the server's
// copy, so nothing about them lives only in the editor's memory.
import { beforeEach, describe, expect, it } from 'vitest'
import type { SyncServerItem } from '../../api/types'
import { offlineDb } from '../../offline/db'
import type { LocalEncounter } from '../../offline/model'
import { recordFromServer, recordPushItem, sameData } from '../../sync/records'
import { testUser } from '../../test/api'
import { mapWith, roomCells } from '../features/fixtures'
import { turnFogOff, turnFogOn, paintDocFog, createArea } from '../fog/ops'
import { playableCells } from '../../fog/cells'
import { seedMap, seedOffline } from '../testing'
import { createEncounter, getEncounter, saveEncounter } from './encounters'
import { encounterDocOf, placeToken, setTokenHidden } from './tokens'

const db = () => offlineDb(testUser.id)
const goblin = { id: 'goblin', name: 'Goblin', size: 'small' as const }
const playable = playableCells(mapWith([], roomCells()))

beforeEach(async () => {
  await seedOffline()
})

async function prepared() {
  const map = await seedMap(mapWith([], roomCells()))
  const created = await createEncounter(db(), map, 's1')
  let doc = encounterDocOf(created)
  doc = turnFogOn(doc, playable)
  doc = paintDocFog(doc, new Set(['0,0', '1,0']), true)
  doc = createArea(doc, 'Nordkammer', new Set(['4,4', '5,4']), playable)
  doc = placeToken(doc, goblin, { x: 4, y: 4 }, 't1', true)
  doc = placeToken(doc, goblin, { x: 0, y: 0 }, 't2')
  return { created, doc }
}

describe('fog prepared offline', () => {
  it('is saved with the encounter and read back by the editor', async () => {
    const { created, doc } = await prepared()
    expect(await saveEncounter(db(), created.id, doc)).toBe(true)

    const stored = (await getEncounter(db(), created.id))!
    expect(stored.fog?.hiddenCells).toHaveLength(78)
    expect(stored.fog?.areas).toMatchObject([{ id: 'a1', name: 'Nordkammer' }])
    expect(stored.tokens.map((t) => [t.id, t.hidden])).toEqual([
      ['t1', true],
      ['t2', undefined],
    ])
    expect(stored.sync.changed).toBe(true)
    // Opening the editor again takes the same document.
    expect(encounterDocOf(stored)).toEqual(doc)
  })

  it('is stored apart from the document, so later edits cannot change a saved copy', async () => {
    const { created, doc } = await prepared()
    await saveEncounter(db(), created.id, doc)
    const hidden = doc.fog!.hiddenCells
    hidden.length = 0
    expect((await getEncounter(db(), created.id))!.fog?.hiddenCells).toHaveLength(78)
  })

  it('turning fog off and showing a creature again are saved too', async () => {
    const { created, doc } = await prepared()
    await saveEncounter(db(), created.id, doc)
    await saveEncounter(db(), created.id, setTokenHidden(turnFogOff(doc), 't1', false))
    const stored = (await getEncounter(db(), created.id))!
    expect(stored.fog).toBeNull()
    expect(stored.tokens[0]).not.toHaveProperty('hidden')
  })

  it('goes up with the sync: the fog document and every token’s hidden flag', async () => {
    const { created, doc } = await prepared()
    await saveEncounter(db(), created.id, doc)
    const stored = (await getEncounter(db(), created.id))!

    const item = recordPushItem('encounter', stored)
    expect(item.encounter?.fog).toEqual(stored.fog)
    expect(item.encounter?.tokens?.map((t) => [t.id, t.hidden])).toEqual([
      ['t1', true],
      ['t2', false],
    ])
  })

  it('pushes no fog for an encounter without it', async () => {
    const { created } = await prepared()
    const item = recordPushItem('encounter', (await getEncounter(db(), created.id))!)
    expect(item.encounter?.fog).toBeNull()
  })

  it('comes back from the server’s copy, and a retry after a lost answer recognises it', async () => {
    const { created, doc } = await prepared()
    await saveEncounter(db(), created.id, doc)
    const stored = (await getEncounter(db(), created.id))!
    const pushed = recordPushItem('encounter', stored)

    const server: SyncServerItem = {
      id: stored.id,
      kind: 'encounter',
      campaignId: stored.campaignId,
      version: 3,
      updatedAt: '2026-10-17T10:00:00Z',
      updatedByDisplayName: null,
      campaign: null,
      creatureType: null,
      map: null,
      encounter: {
        name: pushed.encounter!.name,
        battleMapId: pushed.encounter!.battleMapId,
        status: 'draft',
        archivedAt: null,
        tokens: pushed.encounter!.tokens ?? [],
        sessionId: pushed.encounter!.sessionId,
        mapCopy: null,
        fog: pushed.encounter!.fog,
      },
    }
    expect(sameData(pushed, server)).toBe(true)

    const back = recordFromServer(server, stored) as LocalEncounter
    expect(back.fog).toEqual(stored.fog)
    expect(back.tokens.map((t) => t.hidden)).toEqual([true, false])
    // A different fog on the server is different data.
    const other = { ...server.encounter!, fog: { hiddenCells: [[0, 0]], areas: [] } }
    expect(sameData(pushed, { ...server, encounter: other })).toBe(false)
  })
})
