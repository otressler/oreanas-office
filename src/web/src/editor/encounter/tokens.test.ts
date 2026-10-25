import { describe, expect, it } from 'vitest'
import type { LocalCreatureToken } from '../../offline/model'
import { feature, mapWith, roomCells } from '../features/fixtures'
import {
  canStandAt,
  cleanLabel,
  gridOf,
  misplacedIds,
  moveToken,
  nextLabel,
  notReadyReason,
  placeToken,
  removeToken,
  renameToken,
  setArchived,
  setReady,
  setTokenHidden,
  setTokenInitiative,
  toBoardToken,
  encounterDocOf,
  type EncounterDoc,
  type PlaceableType,
} from './tokens'

const goblin: PlaceableType = { id: 'goblin', name: 'Goblin', size: 'small' }
const ogre: PlaceableType = { id: 'ogre', name: 'Oger', size: 'large' }

const empty = (): EncounterDoc => ({
  name: 'Hinterhalt',
  status: 'draft',
  archivedAt: null,
  tokens: [],
})

const token = (id: string, x: number, y: number, extra: Partial<LocalCreatureToken> = {}) => ({
  id,
  creatureTypeId: 'goblin',
  label: id,
  x,
  y,
  size: 'medium' as const,
  ...extra,
})

const labels = (doc: EncounterDoc) => doc.tokens.map((t) => t.label)

describe('labels', () => {
  it('numbers creatures of a type from 1', () => {
    let doc = empty()
    for (let i = 0; i < 3; i++) doc = placeToken(doc, goblin, { x: i, y: 0 })
    expect(labels(doc)).toEqual(['Goblin 1', 'Goblin 2', 'Goblin 3'])
  })

  it('does not reuse a removed number: 1, 2, 3, remove 2, next is 4', () => {
    let doc = empty()
    for (let i = 0; i < 3; i++) doc = placeToken(doc, goblin, { x: i, y: 0 })
    doc = removeToken(doc, doc.tokens[1]!.id)
    expect(labels(doc)).toEqual(['Goblin 1', 'Goblin 3'])
    doc = placeToken(doc, goblin, { x: 5, y: 0 })
    expect(labels(doc)).toEqual(['Goblin 1', 'Goblin 3', 'Goblin 4'])
  })

  it('goes on after the highest number, so removing the last one frees its number', () => {
    let doc = empty()
    for (let i = 0; i < 3; i++) doc = placeToken(doc, goblin, { x: i, y: 0 })
    doc = removeToken(doc, doc.tokens[2]!.id)
    expect(nextLabel(goblin, doc.tokens)).toBe('Goblin 3')
  })

  it('counts each type on its own', () => {
    let doc = placeToken(empty(), goblin, { x: 0, y: 0 })
    doc = placeToken(doc, ogre, { x: 2, y: 0 })
    doc = placeToken(doc, goblin, { x: 4, y: 0 })
    expect(labels(doc)).toEqual(['Goblin 1', 'Oger 1', 'Goblin 2'])
  })

  it('ignores renamed labels, and labels that only look alike', () => {
    const tokens = [
      token('a', 0, 0, { label: 'Boss' }),
      token('b', 1, 0, { label: 'Goblin 7 (verletzt)' }),
      // Another type's token named like a goblin doesn't count.
      token('c', 2, 0, { label: 'Goblin 9', creatureTypeId: 'ogre' }),
      token('d', 3, 0, { label: 'Goblin 2' }),
    ]
    expect(nextLabel(goblin, tokens)).toBe('Goblin 3')
    expect(nextLabel(goblin, tokens.slice(0, 2))).toBe('Goblin 1')
  })

  it('keeps the label within 40 characters for a long type name', () => {
    const long: PlaceableType = { id: 'long', name: 'A'.repeat(40), size: 'medium' }
    expect(Array.from(nextLabel(long, [])).length).toBeLessThanOrEqual(40)
    let doc = placeToken(empty(), long, { x: 0, y: 0 })
    doc = placeToken(doc, long, { x: 1, y: 0 })
    expect(new Set(labels(doc)).size).toBe(2)
  })

  it('renames a label, trimmed, 1 to 40 characters', () => {
    const doc = placeToken(empty(), goblin, { x: 0, y: 0 }, 't1')
    expect(labels(renameToken(doc, 't1', '  Grisk  '))).toEqual(['Grisk'])
    expect(renameToken(doc, 't1', '   ')).toBe(doc)
    expect(renameToken(doc, 't1', 'x'.repeat(41))).toBe(doc)
    expect(cleanLabel('x'.repeat(40))).toBe('x'.repeat(40))
    // A renamed label drops out of the numbering.
    const renamed = renameToken(doc, 't1', 'Grisk')
    expect(nextLabel(goblin, renamed.tokens)).toBe('Goblin 1')
  })
})

describe('placement', () => {
  const room = gridOf(mapWith([], roomCells()))

  it('allows cells inside the map on walkable ground', () => {
    expect(canStandAt(room, [], 'medium', { x: 0, y: 0 })).toBe(true)
    expect(canStandAt(room, [], 'medium', { x: 9, y: 7 })).toBe(true)
  })

  it('refuses cells outside the map', () => {
    expect(canStandAt(room, [], 'medium', { x: 10, y: 0 })).toBe(false)
    expect(canStandAt(room, [], 'medium', { x: -1, y: 0 })).toBe(false)
  })

  it('needs the whole footprint inside and walkable', () => {
    expect(canStandAt(room, [], 'large', { x: 8, y: 6 })).toBe(true)
    expect(canStandAt(room, [], 'large', { x: 9, y: 6 })).toBe(false)
    expect(canStandAt(room, [], 'huge', { x: 7, y: 5 })).toBe(true)
    expect(canStandAt(room, [], 'huge', { x: 8, y: 5 })).toBe(false)
    expect(canStandAt(room, [], 'gargantuan', { x: 6, y: 4 })).toBe(true)
    expect(canStandAt(room, [], 'gargantuan', { x: 7, y: 4 })).toBe(false)
  })

  it('refuses void, walls and blocking features', () => {
    // (6, 0) is void, (5, 0) a wall, (3, 0) a pillar.
    const cells = roomCells()
      .filter((c) => !(c.x === 6 && c.y === 0))
      .map((c) => (c.x === 5 && c.y === 0 ? { ...c, terrain: 'wall' as const } : c))
    const grid = gridOf(mapWith([feature('f1', 3, 0)], cells))
    expect(canStandAt(grid, [], 'medium', { x: 1, y: 0 })).toBe(true)
    expect(canStandAt(grid, [], 'medium', { x: 3, y: 0 })).toBe(false)
    expect(canStandAt(grid, [], 'medium', { x: 5, y: 0 })).toBe(false)
    expect(canStandAt(grid, [], 'medium', { x: 6, y: 0 })).toBe(false)
    // A footprint touching one bad cell is refused.
    expect(canStandAt(grid, [], 'large', { x: 4, y: 0 })).toBe(false)
  })

  it('lets a creature stand on a bridge over the void', () => {
    const bridge = feature('b1', 4, 2, 2, 1, { kind: 'Brücke', blocksMovement: false })
    const grid = gridOf(
      mapWith(
        [bridge],
        roomCells().filter((c) => c.x < 4 || c.x > 5),
      ),
    )
    expect(canStandAt(grid, [], 'medium', { x: 4, y: 2 })).toBe(true)
    expect(canStandAt(grid, [], 'medium', { x: 5, y: 2 })).toBe(true)
    expect(canStandAt(grid, [], 'medium', { x: 4, y: 3 })).toBe(false)
  })

  it('refuses overlapping another creature, large ones included', () => {
    const tokens = [token('a', 2, 2), token('big', 5, 5, { size: 'large' })]
    expect(canStandAt(room, tokens, 'medium', { x: 2, y: 2 })).toBe(false)
    expect(canStandAt(room, tokens, 'medium', { x: 3, y: 2 })).toBe(true)
    expect(canStandAt(room, tokens, 'medium', { x: 6, y: 6 })).toBe(false)
    expect(canStandAt(room, tokens, 'large', { x: 4, y: 4 })).toBe(false)
    expect(canStandAt(room, tokens, 'large', { x: 3, y: 3 })).toBe(true)
    // The token being moved doesn't block itself.
    expect(canStandAt(room, tokens, 'medium', { x: 2, y: 3 }, 'a')).toBe(true)
    expect(canStandAt(room, tokens, 'large', { x: 6, y: 6 }, 'big')).toBe(true)
  })

  it('marks misplaced tokens: off the map, on a wall, overlapping', () => {
    const grid = gridOf(
      mapWith(
        [],
        [
          ...roomCells().filter((c) => !(c.x === 0 && c.y === 0)),
          { x: 0, y: 0, terrain: 'wall', elevation: 0 },
        ],
      ),
    )
    const tokens = [
      token('wall', 0, 0),
      token('ok', 3, 3),
      token('out', 12, 3),
      token('p', 6, 6),
      token('q', 6, 6),
    ]
    expect([...misplacedIds(grid, tokens)].sort()).toEqual(['out', 'p', 'q', 'wall'])
  })

  it('copies the size from the type when placed, and keeps it when the type changes', () => {
    let doc = placeToken(empty(), ogre, { x: 0, y: 0 })
    expect(doc.tokens[0]!.size).toBe('large')
    // The type grows later; the placed token is a record of its own.
    const grown: PlaceableType = { ...ogre, size: 'huge' }
    expect(doc.tokens[0]!.size).toBe('large')
    doc = placeToken(doc, grown, { x: 4, y: 4 })
    expect(doc.tokens.map((t) => t.size)).toEqual(['large', 'huge'])
  })

  it('moves and removes tokens', () => {
    const doc = placeToken(empty(), goblin, { x: 0, y: 0 }, 't1')
    expect(moveToken(doc, 't1', { x: 0, y: 0 })).toBe(doc)
    expect(moveToken(doc, 't1', { x: 3, y: 2 }).tokens[0]).toMatchObject({ x: 3, y: 2 })
    expect(removeToken(doc, 'nope')).toBe(doc)
    expect(removeToken(doc, 't1').tokens).toEqual([])
  })
})

describe('ready', () => {
  const grid = gridOf(mapWith([], roomCells()))
  const valid = placeToken(empty(), goblin, { x: 1, y: 1 })
  const broken = placeToken(empty(), goblin, { x: 15, y: 1 })

  it('is set by hand when every creature stands validly', () => {
    expect(notReadyReason(valid, grid)).toBeNull()
    expect(setReady(valid, grid, true).status).toBe('ready')
    expect(setReady(setReady(valid, grid, true), grid, false).status).toBe('draft')
  })

  it('is refused while a creature is misplaced, and says why', () => {
    expect(notReadyReason(broken, grid)).toBe('misplaced')
    expect(setReady(broken, grid, true)).toBe(broken)
  })

  it('is refused for an archived encounter', () => {
    const archived = setArchived(valid, '2026-10-14T10:00:00Z')
    expect(notReadyReason(archived, grid)).toBe('archived')
    expect(setReady(archived, grid, true)).toBe(archived)
    expect(setArchived(archived, null).archivedAt).toBeNull()
  })

  it('does not change by itself when the map changes: a ready encounter stays ready', () => {
    const ready = setReady(valid, grid, true)
    const wall = gridOf(
      mapWith(
        [],
        roomCells().filter((c) => !(c.x === 1 && c.y === 1)),
      ),
    )
    expect(ready.status).toBe('ready')
    expect(notReadyReason(ready, wall)).toBe('misplaced')
    // It can still be taken back to a draft.
    expect(setReady(ready, wall, false).status).toBe('draft')
  })

  it('leaves active and ended encounters alone', () => {
    const active: EncounterDoc = { ...valid, status: 'active' }
    expect(setReady(active, grid, false)).toBe(active)
  })
})

describe('hidden creatures', () => {
  it('places a token hidden on request, and visible by default', () => {
    const visible = placeToken(empty(), goblin, { x: 0, y: 0 }, 't1')
    expect(visible.tokens[0]).not.toHaveProperty('hidden')
    const doc = placeToken(visible, goblin, { x: 1, y: 0 }, 't2', true)
    expect(doc.tokens.map((t) => t.hidden)).toEqual([undefined, true])
    expect(doc.tokens[1]?.label).toBe('Goblin 2')
  })

  it('hides and shows a creature, and leaves the document alone when nothing changes', () => {
    const doc = placeToken(empty(), goblin, { x: 0, y: 0 }, 't1')
    expect(setTokenHidden(doc, 't1', false)).toBe(doc)
    expect(setTokenHidden(doc, 'missing', true)).toBe(doc)
    const hidden = setTokenHidden(doc, 't1', true)
    expect(hidden.tokens[0]?.hidden).toBe(true)
    expect(setTokenHidden(hidden, 't1', true)).toBe(hidden)
    const shown = setTokenHidden(hidden, 't1', false)
    expect(shown.tokens[0]).not.toHaveProperty('hidden')
  })

  it('gives a creature its own initiative and hands it back to its type', () => {
    const doc = placeToken(empty(), goblin, { x: 0, y: 0 }, 't1')
    expect(setTokenInitiative(doc, 't1', { modifier: null })).toBe(doc)
    expect(setTokenInitiative(doc, 'missing', { modifier: 2 })).toBe(doc)
    const own = setTokenInitiative(doc, 't1', { modifier: 4 })
    const both = setTokenInitiative(own, 't1', { advantage: false })
    expect(both.tokens[0]).toMatchObject({ initiativeModifier: 4, initiativeAdvantage: false })
    const back = setTokenInitiative(both, 't1', { modifier: null, advantage: null })
    expect(back.tokens[0]).not.toHaveProperty('initiativeModifier')
    expect(back.tokens[0]).not.toHaveProperty('initiativeAdvantage')
  })

  it('draws a hidden token as hidden (see-through with the eye mark)', () => {
    const doc = placeToken(empty(), goblin, { x: 2, y: 2 }, 't1', true)
    const grid = gridOf(mapWith([], roomCells()))
    expect(toBoardToken(doc.tokens[0]!, grid).hidden).toBe(true)
    const plain = placeToken(empty(), goblin, { x: 2, y: 2 }, 't2')
    expect(toBoardToken(plain.tokens[0]!, grid).hidden).toBe(false)
  })

  it('takes the fog from the stored record only when there is some', () => {
    const base = { name: 'A', status: 'draft' as const, archivedAt: null, tokens: [] }
    const record = { ...base, id: 'e1' } as unknown as Parameters<typeof encounterDocOf>[0]
    expect(encounterDocOf(record)).not.toHaveProperty('fog')
    const fog = { hiddenCells: [[1, 1]], areas: [] }
    expect(encounterDocOf({ ...record, fog }).fog).toBe(fog)
    expect(encounterDocOf({ ...record, fog: null }).fog).toBeNull()
  })
})
