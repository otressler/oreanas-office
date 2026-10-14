import { describe, expect, it } from 'vitest'
import { offlineDb } from '../offline/db'
import { createMap, duplicateMap, getMap, listMaps, saveMap, setArchived } from './maps'
import { emptyMap } from './model'

const db = () => offlineDb('u1')

describe('maps in the browser', () => {
  it('creates a map with a browser-made id, not synced yet', async () => {
    const map = await createMap(db(), 'c1', emptyMap('Klamm', 20, 12))

    expect(map.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(map).toMatchObject({
      campaignId: 'c1',
      name: 'Klamm',
      width: 20,
      height: 12,
      copiedFromMapId: null,
      archivedAt: null,
      sync: { baseVersion: 0, changed: true, editCount: 1, issue: null, server: null },
      recordVersion: 1,
    })
    expect(await getMap(db(), map.id)).toEqual(map)
  })

  it('keeps each user’s maps apart', async () => {
    const map = await createMap(db(), 'c1', emptyMap('Klamm', 4, 4))
    expect(await getMap(offlineDb('u2'), map.id)).toBeUndefined()
  })

  it('lists a campaign’s maps by name, numbers in order', async () => {
    await createMap(db(), 'c1', emptyMap('Karte 10', 4, 4))
    await createMap(db(), 'c1', emptyMap('Karte 2', 4, 4))
    await createMap(db(), 'c2', emptyMap('Anderswo', 4, 4))
    expect((await listMaps(db(), 'c1')).map((m) => m.name)).toEqual(['Karte 2', 'Karte 10'])
  })

  it('saves edits and counts them', async () => {
    const map = await createMap(db(), 'c1', emptyMap('Klamm', 4, 4))
    const edited = { ...emptyMap('Neue Klamm', 6, 4), scene: 'Seilbrücke' }

    expect(await saveMap(db(), map.id, edited)).toBe(true)
    const stored = await getMap(db(), map.id)
    expect(stored).toMatchObject({ name: 'Neue Klamm', width: 6, scene: 'Seilbrücke' })
    expect(stored?.sync).toEqual({
      baseVersion: 0,
      changed: true,
      editCount: 2,
      issue: null,
      server: null,
    })
    expect(await saveMap(db(), 'missing', edited)).toBe(false)
  })

  it('duplicates a map as a separate copy that remembers its source', async () => {
    const map = await createMap(db(), 'c1', { ...emptyMap('Klamm', 4, 4), vibe: 'windig' })
    const copy = await duplicateMap(db(), map.id, 'Klamm (Kopie)')

    expect(copy.id).not.toBe(map.id)
    expect(copy).toMatchObject({ name: 'Klamm (Kopie)', vibe: 'windig', copiedFromMapId: map.id })
    await saveMap(db(), copy.id, { ...emptyMap('Geändert', 4, 4) })
    expect((await getMap(db(), map.id))?.name).toBe('Klamm')
  })

  it('archives a map and brings it back', async () => {
    const map = await createMap(db(), 'c1', emptyMap('Klamm', 4, 4))
    await setArchived(db(), map.id, true)
    const archived = await getMap(db(), map.id)
    expect(archived?.archivedAt).not.toBeNull()
    expect(archived?.sync.editCount).toBe(2)

    await setArchived(db(), map.id, true)
    expect((await getMap(db(), map.id))?.sync.editCount).toBe(2)

    await setArchived(db(), map.id, false)
    expect((await getMap(db(), map.id))?.archivedAt).toBeNull()
  })
})
