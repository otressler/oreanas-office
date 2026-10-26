import { describe, expect, it } from 'vitest'
import type { BoardToken, FogArea } from '../api/types'
import { hiddenInSameAreas } from './hiddenHere'

function creature(id: string, x: number, y: number, extra: Partial<BoardToken> = {}): BoardToken {
  return {
    id,
    kind: 'creature',
    characterId: null,
    creatureTypeId: 'goblin',
    ownerUserId: null,
    label: id,
    x,
    y,
    elevation: 0,
    size: 'small',
    colorIndex: null,
    version: 0,
    imageUrl: null,
    color: null,
    statuses: [],
    hidden: true,
    ...extra,
  }
}

const north: FogArea = {
  id: 'a1',
  name: 'Nordkammer',
  cells: [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ],
}
const south: FogArea = { id: 'a2', name: 'Süd', cells: [[5, 5]] }
const overlapping: FogArea = {
  id: 'a3',
  name: 'Gang',
  cells: [
    [1, 1],
    [2, 1],
    [3, 1],
  ],
}

describe('hiddenInSameAreas', () => {
  it('finds the hidden creatures inside the same area, the token itself included', () => {
    const tokens = [creature('a', 0, 0), creature('b', 1, 1), creature('c', 5, 5)]
    expect(hiddenInSameAreas(tokens[0]!, tokens, [north, south]).map((t) => t.id)).toEqual([
      'a',
      'b',
    ])
  })

  it('leaves out revealed creatures, characters and creatures outside the area', () => {
    const tokens = [
      creature('a', 0, 0),
      creature('shown', 1, 0, { hidden: false }),
      creature('hero', 0, 1, { kind: 'character' }),
      creature('far', 4, 4),
    ]
    expect(hiddenInSameAreas(tokens[0]!, tokens, [north]).map((t) => t.id)).toEqual(['a'])
  })

  it('follows every area the footprint touches, overlapping ones included', () => {
    const tokens = [creature('a', 1, 1), creature('b', 0, 0), creature('c', 3, 1)]
    expect(hiddenInSameAreas(tokens[0]!, tokens, [north, overlapping]).map((t) => t.id)).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('counts a large creature that only touches the area with part of its footprint', () => {
    const ogre = creature('ogre', 1, 1, { size: 'large' })
    const tokens = [ogre, creature('b', 0, 0), creature('c', 2, 2)]
    // The ogre covers 1,1 to 2,2: it touches the north area and shares nothing else.
    expect(hiddenInSameAreas(ogre, tokens, [north]).map((t) => t.id)).toEqual(['ogre', 'b'])
  })

  it('is empty for a token in no area', () => {
    const tokens = [creature('a', 4, 4)]
    expect(hiddenInSameAreas(tokens[0]!, tokens, [north, south])).toEqual([])
    expect(hiddenInSameAreas(tokens[0]!, tokens, [])).toEqual([])
  })
})
