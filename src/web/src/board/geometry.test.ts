import { describe, expect, it } from 'vitest'
import type { BoardState } from '../api/types'
import gorgeFixture from './fixtures/gorge-crossing.board.json'
import {
  buildGrid,
  canPlace,
  footprint,
  footprintCells,
  placementElevation,
  stackCounts,
  tokenAt,
  tokensAt,
} from './geometry'

const gorge = gorgeFixture as BoardState
const grid = buildGrid(gorge.map)

describe('buildGrid', () => {
  it('treats cells missing from the layout as void', () => {
    // The gorge between x 8 and 11 isn't listed in the file.
    expect(grid.terrain(9, 0)).toBe('void')
    expect(grid.walkable(9, 0)).toBe(false)
    expect(grid.terrain(0, 0)).toBe('floor')
  })

  it('treats everything outside the map as void', () => {
    expect(grid.terrain(-1, 0)).toBe('void')
    expect(grid.walkable(20, 0)).toBe(false)
  })

  it('makes cells under a non-blocking feature walkable', () => {
    // The rope bridge over the gorge.
    expect(grid.terrain(9, 5)).toBe('void')
    expect(grid.featureAt(9, 5)?.kind).toBe('bridge')
    expect(grid.walkable(9, 5)).toBe(true)
  })

  it('blocks cells under a blocking feature', () => {
    expect(grid.featureAt(3, 2)?.kind).toBe('pillar')
    expect(grid.walkable(3, 2)).toBe(false)
  })

  it('uses a non-blocking feature’s elevation', () => {
    const lifted = buildGrid({
      width: 2,
      height: 1,
      layout: {
        schemaVersion: 1,
        cells: [{ x: 0, y: 0, terrain: 'floor', elevation: 1.5 }],
        features: [
          {
            id: 'f1',
            kind: 'stairs',
            label: 'Treppe',
            x: 1,
            y: 0,
            w: 1,
            h: 1,
            elevation: 3,
            blocksMovement: false,
          },
        ],
        entrances: [],
      },
    })
    expect(lifted.elevation(0, 0)).toBe(1.5)
    expect(lifted.elevation(1, 0)).toBe(3)
  })
})

describe('footprints', () => {
  it('covers 2×2 for Large and one cell for Tiny to Medium', () => {
    expect(footprint('tiny')).toBe(1)
    expect(footprint('medium')).toBe(1)
    expect(footprint('large')).toBe(2)
    expect(footprint('gargantuan')).toBe(4)
    expect(footprintCells('large', 3, 4)).toEqual([
      { x: 3, y: 4 },
      { x: 4, y: 4 },
      { x: 3, y: 5 },
      { x: 4, y: 5 },
    ])
  })
})

describe('canPlace', () => {
  const tokens = [{ id: 't1', x: 0, y: 0, size: 'medium' as const }]

  it('refuses cells taken by another token', () => {
    expect(canPlace(grid, tokens, 'medium', 0, 0)).toBe(false)
    expect(canPlace(grid, tokens, 'medium', 1, 0)).toBe(true)
  })

  it('ignores the token being moved', () => {
    expect(canPlace(grid, tokens, 'medium', 0, 0, 't1')).toBe(true)
  })

  it('needs the whole footprint on walkable cells', () => {
    // x 7 is ground, x 8 is the gorge.
    expect(canPlace(grid, [], 'large', 6, 0)).toBe(true)
    expect(canPlace(grid, [], 'large', 7, 0)).toBe(false)
  })

  it('refuses a large footprint that covers part of another token', () => {
    const other = [{ id: 't2', x: 2, y: 1, size: 'medium' as const }]
    expect(canPlace(grid, other, 'large', 1, 0)).toBe(false)
    expect(canPlace(grid, other, 'large', 0, 0)).toBe(true)
  })

  it('refuses footprints that leave the map', () => {
    expect(canPlace(grid, [], 'large', 19, 0)).toBe(false)
  })
})

describe('placementElevation', () => {
  it('takes the highest elevation under the footprint', () => {
    const hill = buildGrid({
      width: 2,
      height: 2,
      layout: {
        schemaVersion: 1,
        cells: [
          { x: 0, y: 0, terrain: 'floor', elevation: 0 },
          { x: 1, y: 0, terrain: 'floor', elevation: 1 },
          { x: 0, y: 1, terrain: 'floor', elevation: 2.5 },
          { x: 1, y: 1, terrain: 'floor', elevation: 0 },
        ],
        features: [],
        entrances: [],
      },
    })
    expect(placementElevation(hill, 'large', 0, 0)).toBe(2.5)
    expect(placementElevation(hill, 'medium', 1, 0)).toBe(1)
  })
})

describe('tokenAt', () => {
  const tokens = [
    { id: 'ogre', x: 2, y: 2, size: 'large' as const },
    { id: 'goblin', x: 3, y: 3, size: 'small' as const },
  ]

  it('finds a token anywhere on its footprint', () => {
    expect(tokenAt(tokens, { x: 2, y: 3 })?.id).toBe('ogre')
    expect(tokenAt(tokens, { x: 4, y: 4 })).toBeUndefined()
  })

  it('prefers the token drawn on top: later in the list, or the selected one', () => {
    expect(tokenAt(tokens, { x: 3, y: 3 })?.id).toBe('goblin')
    expect(tokenAt(tokens, { x: 3, y: 3 }, 'ogre')?.id).toBe('ogre')
    expect(tokenAt(tokens, { x: 2, y: 2 }, 'goblin')?.id).toBe('ogre')
  })
})

describe('tokensAt', () => {
  const tokens = [
    { id: 'ogre', x: 2, y: 2, size: 'large' as const },
    { id: 'goblin', x: 3, y: 3, size: 'small' as const },
    { id: 'hero', x: 3, y: 3, size: 'medium' as const },
  ]

  it('lists every token on the cell, top first, the selected one on top', () => {
    expect(tokensAt(tokens, { x: 3, y: 3 }).map((t) => t.id)).toEqual(['hero', 'goblin', 'ogre'])
    expect(tokensAt(tokens, { x: 3, y: 3 }, 'goblin').map((t) => t.id)).toEqual([
      'goblin',
      'hero',
      'ogre',
    ])
    expect(tokensAt(tokens, { x: 2, y: 2 }, 'hero').map((t) => t.id)).toEqual(['ogre'])
  })
})

describe('stackCounts', () => {
  it('counts overlapping tokens on the one drawn on top', () => {
    const tokens = [
      { id: 'ogre', x: 2, y: 2, size: 'large' as const },
      { id: 'goblin', x: 3, y: 3, size: 'small' as const },
      // Touches the ogre's edge but doesn't overlap it.
      { id: 'hero', x: 4, y: 2, size: 'medium' as const },
      { id: 'a', x: 8, y: 8, size: 'medium' as const },
      { id: 'b', x: 8, y: 8, size: 'medium' as const },
    ]

    expect(stackCounts(tokens)).toEqual(
      new Map([
        ['goblin', 2],
        ['b', 2],
      ]),
    )
    expect(stackCounts(tokens, 'a')).toEqual(
      new Map([
        ['goblin', 2],
        ['a', 2],
      ]),
    )
  })

  it('joins stacks that overlap through a token between them', () => {
    const tokens = [
      { id: 'left', x: 0, y: 0, size: 'medium' as const },
      { id: 'middle', x: 0, y: 0, size: 'large' as const },
      { id: 'right', x: 1, y: 1, size: 'medium' as const },
    ]
    expect(stackCounts(tokens)).toEqual(new Map([['right', 3]]))
  })
})
