import { describe, expect, it } from 'vitest'
import type { BoardToken, LayoutCell } from '../../api/types'
import { buildGrid } from '../../board/geometry'
import {
  finishSpawn,
  isSpawnId,
  NEW_SPAWN,
  orderTypes,
  pickSpawnType,
  placedByType,
  previewTokens,
  setSpawnHidden,
  spawnId,
  spawnIds,
  tapSpawn,
  toRequest,
  type SpawnType,
} from './draft'

const goblin: SpawnType = { id: 'goblin', name: 'Goblin', size: 'medium' }
const wolf: SpawnType = { id: 'wolf', name: 'Wolf', size: 'large' }
const ogre: SpawnType = { id: 'ogre', name: 'Oger', size: 'large' }

const cells: LayoutCell[] = []
for (let y = 0; y < 6; y++)
  for (let x = 0; x < 6; x++) cells.push({ x, y, terrain: 'floor' as const, elevation: 0 })
// A wall column at x = 5.
for (let y = 0; y < 6; y++) cells[y * 6 + 5] = { x: 5, y, terrain: 'wall', elevation: 0 }
const grid = buildGrid({
  width: 6,
  height: 6,
  layout: { schemaVersion: 1, cells, features: [], entrances: [] },
})

function creature(id: string, label: string, typeId: string): BoardToken {
  return {
    id,
    kind: 'creature',
    characterId: null,
    creatureTypeId: typeId,
    ownerUserId: null,
    label,
    x: 0,
    y: 0,
    elevation: 0,
    size: 'medium',
    colorIndex: null,
    version: 0,
    imageUrl: null,
    color: null,
    statuses: [],
    hidden: false,
    dead: false,
  }
}

describe('placing creatures', () => {
  it('places one token per tap and shows nothing without a picked type', () => {
    expect(tapSpawn(NEW_SPAWN, { x: 1, y: 1 }, grid, 'k1')).toBe(NEW_SPAWN)
    let draft = pickSpawnType(NEW_SPAWN, goblin)
    draft = tapSpawn(draft, { x: 1, y: 1 }, grid, 'k1')
    draft = tapSpawn(draft, { x: 2, y: 1 }, grid, 'k2')
    expect(draft.placements.map((p) => [p.x, p.y])).toEqual([
      [1, 1],
      [2, 1],
    ])
  })

  it('refuses cells where the creature cannot stand', () => {
    const draft = pickSpawnType(NEW_SPAWN, goblin)
    expect(tapSpawn(draft, { x: 5, y: 1 }, grid, 'k').placements).toHaveLength(0)
    expect(tapSpawn(draft, { x: 9, y: 9 }, grid, 'k').placements).toHaveLength(0)
  })

  it('lets a spawned creature stand on another one', () => {
    let draft = pickSpawnType(NEW_SPAWN, goblin)
    draft = tapSpawn(draft, { x: 1, y: 1 }, grid, 'k1')
    draft = pickSpawnType(draft, wolf)
    // The wolf covers the cell of the goblin: a tap there takes the goblin away first.
    const second = tapSpawn(draft, { x: 2, y: 2 }, grid, 'k2')
    expect(second.placements).toHaveLength(2)
  })

  it('takes a placed token away when it is tapped again', () => {
    let draft = pickSpawnType(NEW_SPAWN, goblin)
    draft = tapSpawn(draft, { x: 1, y: 1 }, grid, 'k1')
    draft = tapSpawn(draft, { x: 3, y: 3 }, grid, 'k2')
    draft = tapSpawn(draft, { x: 1, y: 1 }, grid, 'k3')
    expect(draft.placements.map((p) => p.key)).toEqual(['k2'])
  })

  it('switching the type in between mixes types in one spawn', () => {
    let draft = pickSpawnType(NEW_SPAWN, goblin)
    draft = tapSpawn(draft, { x: 0, y: 0 }, grid, 'k1')
    draft = tapSpawn(draft, { x: 1, y: 0 }, grid, 'k2')
    draft = pickSpawnType(draft, wolf)
    draft = tapSpawn(draft, { x: 0, y: 2 }, grid, 'k3')
    expect(placedByType(draft).map((e) => [e.type.name, e.count])).toEqual([
      ['Goblin', 2],
      ['Wolf', 1],
    ])
  })

  it('finishes only with something placed, and sends hidden with the creatures', () => {
    expect(finishSpawn(pickSpawnType(NEW_SPAWN, goblin)).finished).toBe(false)
    let draft = tapSpawn(pickSpawnType(NEW_SPAWN, goblin), { x: 1, y: 1 }, grid, 'k1')
    draft = setSpawnHidden(finishSpawn(draft), true)
    expect(draft.finished).toBe(true)
    expect(toRequest('enc-1', draft)).toEqual({
      encounterId: 'enc-1',
      hidden: true,
      creatures: [{ creatureTypeId: 'goblin', x: 1, y: 1 }],
    })
  })
})

describe('the preview tokens', () => {
  const board = {
    tokens: [creature('a', 'Goblin 1', 'goblin'), creature('b', 'Goblin 2', 'goblin')],
    removedTokens: [creature('c', 'Goblin 4', 'goblin')],
    fog: null,
  }

  it('numbers after the highest label, removed tokens included', () => {
    let draft = pickSpawnType(NEW_SPAWN, goblin)
    draft = tapSpawn(draft, { x: 1, y: 1 }, grid, 'k1')
    draft = tapSpawn(draft, { x: 2, y: 1 }, grid, 'k2')
    expect(previewTokens(draft, board).map((t) => t.label)).toEqual(['Goblin 5', 'Goblin 6'])
  })

  it('leaves the numbers off in an encounter with fog', () => {
    let draft = pickSpawnType(NEW_SPAWN, goblin)
    draft = tapSpawn(draft, { x: 1, y: 1 }, grid, 'k1')
    const fogged = { ...board, fog: { version: 1, hiddenCells: [], areas: [] } }
    expect(previewTokens(draft, fogged).map((t) => t.label)).toEqual(['Goblin'])
  })

  it('gives them ids the page can tell from real tokens', () => {
    let draft = pickSpawnType(NEW_SPAWN, goblin)
    draft = tapSpawn(draft, { x: 1, y: 1 }, grid, 'k1')
    const [token] = previewTokens(draft, board)
    expect(token!.id).toBe(spawnId('k1'))
    expect(isSpawnId(token!.id)).toBe(true)
    expect(isSpawnId('abc')).toBe(false)
    expect(spawnIds(draft)).toEqual(new Set([spawnId('k1')]))
  })
})

describe('the picker order', () => {
  it('lists the types used in this fight first, each group by name', () => {
    const board = {
      tokens: [creature('a', 'Oger 1', 'ogre')],
      removedTokens: [creature('b', 'Wolf 1', 'wolf')],
    }
    const { used, others } = orderTypes(
      [wolf, goblin, ogre, { id: 'bat', name: 'Fledermaus' }],
      board,
    )
    expect(used.map((t) => t.name)).toEqual(['Oger', 'Wolf'])
    expect(others.map((t) => t.name)).toEqual(['Fledermaus', 'Goblin'])
  })
})
