import { describe, expect, it } from 'vitest'
import type { BoardState, Character } from '../api/types'
import gorgeFixture from '../board/fixtures/gorge-crossing.board.json'
import { buildGrid, canPlace, cellKey } from '../board/geometry'
import { autoPlace, freeCells, setupTokenId, withPlacedCharacters } from './placement'

// The gorge crossing as the setup screen sees it: ready, creatures only.
const fixture = gorgeFixture as unknown as BoardState
const gorge: BoardState = {
  ...fixture,
  status: 'ready',
  sessionId: 's1',
  tokens: fixture.tokens.filter((token) => token.kind === 'creature'),
}
const grid = buildGrid(gorge.map)

function character(id: string, fields: Partial<Character> = {}): Character {
  return {
    id,
    ownerUserId: `owner-${id}`,
    ownerDisplayName: 'Mira',
    name: id,
    size: 'medium',
    canEdit: true,
    colorIndex: 0,
    color: null,
    appearance: '',
    portraitUrl: null,
    ...fields,
  }
}

describe('withPlacedCharacters', () => {
  it('adds placed characters as tokens and leaves unplaced ones out', () => {
    const ilse = character('ilse', { name: 'Ilse', size: 'small', colorIndex: 3 })
    const brom = character('brom')
    const board = withPlacedCharacters(
      gorge,
      grid,
      [brom, ilse],
      new Map([
        ['ilse', { x: 9, y: 5 }],
        ['brom', null],
      ]),
    )

    expect(board.tokens).toHaveLength(gorge.tokens.length + 1)
    expect(board.tokens.at(-1)).toEqual({
      id: setupTokenId('ilse'),
      kind: 'character',
      characterId: 'ilse',
      creatureTypeId: null,
      ownerUserId: 'owner-ilse',
      label: 'Ilse',
      x: 9,
      y: 5,
      elevation: grid.elevation(9, 5),
      size: 'small',
      // The server's order, not the list's.
      colorIndex: 3,
      version: 0,
      imageUrl: null,
      color: null,
      statuses: [],
      hidden: false,
    })
  })
})

describe('freeCells', () => {
  it('offers walkable cells without tokens, the bridge included', () => {
    const cells = freeCells(grid, gorge.tokens, character('a'))
    expect(cells.has(cellKey(0, 5))).toBe(true)
    // The rope bridge over the gorge (feature f1 at 8,5).
    expect(cells.has(cellKey(9, 5))).toBe(true)
    // The menhir blocks movement; a goblin stands at 14,4.
    expect(cells.has(cellKey(3, 2))).toBe(false)
    expect(cells.has(cellKey(14, 4))).toBe(false)
  })

  it("ignores the character's own token, so it can move a step", () => {
    const placed = withPlacedCharacters(
      gorge,
      grid,
      [character('a')],
      new Map([['a', { x: 0, y: 5 }]]),
    )
    expect(freeCells(grid, placed.tokens, character('a')).has(cellKey(0, 5))).toBe(true)
    expect(freeCells(grid, placed.tokens, character('b')).has(cellKey(0, 5))).toBe(false)
  })
})

describe('autoPlace', () => {
  it('fills the cells nearest the entrance first, in reading order', () => {
    const placed = autoPlace(grid, gorge.tokens, gorge.map.layout.entrances, [
      character('a'),
      character('b'),
    ])
    expect(placed.get('a')).toEqual({ x: 0, y: 5 })
    expect(placed.get('b')).toEqual({ x: 0, y: 6 })
  })

  it('finds room for a large character where its whole footprint fits', () => {
    const placed = autoPlace(grid, gorge.tokens, gorge.map.layout.entrances, [
      character('big', { size: 'large' }),
    ])
    const spot = placed.get('big')!
    expect(canPlace(grid, gorge.tokens, 'large', spot.x, spot.y)).toBe(true)
  })

  it('gives null to a character for whom no room is left', () => {
    const tiny: BoardState['map'] = {
      ...gorge.map,
      width: 1,
      height: 1,
      layout: {
        ...gorge.map.layout,
        cells: [{ x: 0, y: 0, terrain: 'floor', elevation: 0 }],
        features: [],
        entrances: [],
      },
    }
    const placed = autoPlace(buildGrid(tiny), [], [], [character('a'), character('b')])
    expect(placed.get('a')).toEqual({ x: 0, y: 0 })
    expect(placed.get('b')).toBeNull()
  })
})
