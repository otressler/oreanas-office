import { describe, expect, it } from 'vitest'
import { offlineDb } from '../offline/db'
import {
  checkCreatureType,
  createCreatureType,
  listCreatureTypes,
  saveCreatureType,
  setCreatureTypeArchived,
  type CreatureTypeInput,
} from './creatureTypes'

const db = () => offlineDb('00000000-0000-0000-0000-0000000000a1')
const input = (name: string, extra: Partial<CreatureTypeInput> = {}): CreatureTypeInput => ({
  name,
  size: 'small',
  appearance: '',
  notes: '',
  initiativeModifier: 0,
  initiativeAdvantage: false,
  ...extra,
})

describe('creature types', () => {
  it('creates a type as a new, unsynced record with a browser-made id', async () => {
    const result = await createCreatureType(db(), 'c1', input('  Goblin ', { appearance: 'grün' }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.type).toMatchObject({
      campaignId: 'c1',
      name: 'Goblin',
      size: 'small',
      appearance: 'grün',
      archivedAt: null,
      sync: { baseVersion: 0, changed: true },
    })
    expect(result.type.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(await db().creatureTypes.get(result.type.id)).toEqual(result.type)
  })

  it('keeps the initiative modifier and advantage, and checks the modifier', async () => {
    const result = await createCreatureType(
      db(),
      'c1',
      input('Ork', { initiativeModifier: -1, initiativeAdvantage: true }),
    )
    expect(result.ok && result.type).toMatchObject({
      initiativeModifier: -1,
      initiativeAdvantage: true,
    })
    for (const initiativeModifier of [21, -11, 1.5, Number.NaN]) {
      expect(checkCreatureType(input('Wolf', { initiativeModifier }), [])).toEqual([
        'initiativeInvalid',
      ])
    }
    expect(checkCreatureType(input('Wolf', { initiativeModifier: 20 }), [])).toEqual([])
  })

  it('lists a campaign’s types by name, archived ones included', async () => {
    await createCreatureType(db(), 'c1', input('Wolf'))
    await createCreatureType(db(), 'c1', input('Ork'))
    await createCreatureType(db(), 'c2', input('Drache'))
    const archived = await createCreatureType(db(), 'c1', input('Bär'))
    if (archived.ok) await setCreatureTypeArchived(db(), archived.type.id, true)
    const list = await listCreatureTypes(db(), 'c1')
    expect(list.map((t) => t.name)).toEqual(['Bär', 'Ork', 'Wolf'])
  })

  it('keeps names unique per campaign, ignoring case and spaces', async () => {
    await createCreatureType(db(), 'c1', input('Goblin'))
    for (const name of ['goblin', ' GOBLIN ', 'Goblin']) {
      expect(await createCreatureType(db(), 'c1', input(name))).toEqual({
        ok: false,
        problems: ['nameTaken'],
      })
    }
    // Another campaign has its own bestiary.
    expect((await createCreatureType(db(), 'c2', input('goblin'))).ok).toBe(true)
    expect(await listCreatureTypes(db(), 'c1')).toHaveLength(1)
  })

  it('keeps an archived type’s name taken', async () => {
    const goblin = await createCreatureType(db(), 'c1', input('Goblin'))
    if (!goblin.ok) throw new Error('not created')
    await setCreatureTypeArchived(db(), goblin.type.id, true)
    expect((await createCreatureType(db(), 'c1', input('goblin'))).ok).toBe(false)
  })

  it('checks the limits: name 1 to 40, appearance 500, notes 2000', () => {
    expect(checkCreatureType(input('   '), [])).toEqual(['nameMissing'])
    expect(checkCreatureType(input('x'.repeat(40)), [])).toEqual([])
    expect(checkCreatureType(input('x'.repeat(41)), [])).toEqual(['nameTooLong'])
    expect(checkCreatureType(input('A', { appearance: 'x'.repeat(500) }), [])).toEqual([])
    expect(checkCreatureType(input('A', { appearance: 'x'.repeat(501) }), [])).toEqual([
      'appearanceTooLong',
    ])
    expect(checkCreatureType(input('A', { notes: 'x'.repeat(2001) }), [])).toEqual(['notesTooLong'])
  })

  it('saves changes and marks the type changed; its own name is not a clash', async () => {
    const created = await createCreatureType(db(), 'c1', input('Goblin'))
    if (!created.ok) throw new Error('not created')
    const saved = await saveCreatureType(
      db(),
      created.type.id,
      input('GOBLIN', { size: 'medium', notes: 'feige' }),
    )
    expect(saved.ok).toBe(true)
    const stored = await db().creatureTypes.get(created.type.id)
    expect(stored).toMatchObject({ name: 'GOBLIN', size: 'medium', notes: 'feige' })
    expect(stored!.sync.editCount).toBe(created.type.sync.editCount + 1)
  })

  it('refuses to rename a type to another one’s name', async () => {
    await createCreatureType(db(), 'c1', input('Goblin'))
    const wolf = await createCreatureType(db(), 'c1', input('Wolf'))
    if (!wolf.ok) throw new Error('not created')
    expect(await saveCreatureType(db(), wolf.type.id, input('goblin'))).toEqual({
      ok: false,
      problems: ['nameTaken'],
    })
    expect((await db().creatureTypes.get(wolf.type.id))!.name).toBe('Wolf')
  })

  it('archives and brings a type back, never deleting it', async () => {
    const created = await createCreatureType(db(), 'c1', input('Goblin'))
    if (!created.ok) throw new Error('not created')
    await setCreatureTypeArchived(db(), created.type.id, true)
    const archived = await db().creatureTypes.get(created.type.id)
    expect(archived!.archivedAt).not.toBeNull()
    expect(archived!.sync.changed).toBe(true)

    await setCreatureTypeArchived(db(), created.type.id, false)
    expect((await db().creatureTypes.get(created.type.id))!.archivedAt).toBeNull()
    expect(await db().creatureTypes.count()).toBe(1)
  })
})
