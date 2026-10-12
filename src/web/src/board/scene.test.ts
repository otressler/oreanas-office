import { describe, expect, it } from 'vitest'
import type { BoardState } from '../api/types'
import cryptFixture from './fixtures/crypt.board.json'
import gorgeFixture from './fixtures/gorge-crossing.board.json'
import riverFixture from './fixtures/river-ford.board.json'
import { cellKey } from './geometry'
import {
  buildHighlight,
  buildScene,
  edgeSegments,
  elevationShade,
  entranceSide,
  featureStyle,
  type Segment,
} from './scene'

const gorge = buildScene((gorgeFixture as BoardState).map)
const crypt = buildScene((cryptFixture as BoardState).map)

/** Whether a merged segment list contains the edge between two cells. */
function hasEdge(segments: Segment[], a: [number, number], b: [number, number]): boolean {
  const horizontal = a[0] === b[0]
  const line = horizontal ? Math.max(a[1], b[1]) : Math.max(a[0], b[0])
  const at = horizontal ? a[0] : a[1]
  return segments.some((s) =>
    horizontal
      ? s.y1 === s.y2 && s.y1 === line && s.x1 <= at && at < s.x2
      : s.x1 === s.x2 && s.x1 === line && s.y1 <= at && at < s.y2,
  )
}

describe('edgeSegments', () => {
  it('merges neighbouring edges into one line', () => {
    // Every edge of a 3×2 grid: 3 horizontal and 4 vertical lines.
    const all = edgeSegments(3, 2, () => true)
    expect(all).toHaveLength(7)
    expect(all).toContainEqual({ x1: 0, y1: 0, x2: 3, y2: 0 })
    expect(all).toContainEqual({ x1: 3, y1: 0, x2: 3, y2: 2 })
  })

  it('asks about the cells on both sides, including outside the map', () => {
    const asked: string[] = []
    edgeSegments(1, 1, (a, b) => {
      asked.push(`${a.x},${a.y}|${b.x},${b.y}`)
      return false
    })
    expect(asked).toEqual(['0,-1|0,0', '0,0|0,1', '-1,0|0,0', '0,0|1,0'])
  })
})

describe('buildScene', () => {
  it('counts a bridge over void as part of the map', () => {
    expect(gorge.inMap(9, 0)).toBe(false)
    expect(gorge.inMap(9, 5)).toBe(true)
    expect(gorge.baseCells.length / 2).toBe(192)
  })

  it('draws grid lines on open ground and the bridge, not in the gorge', () => {
    expect(hasEdge(gorge.gridLines, [1, 1], [2, 1])).toBe(true)
    expect(hasEdge(gorge.gridLines, [9, 5], [10, 5])).toBe(true)
    expect(hasEdge(gorge.gridLines, [9, 0], [10, 0])).toBe(false)
  })

  it('leaves the inside of walls without grid lines but rims them', () => {
    // The crypt's outer wall: (0, 0) and (1, 0) are both wall.
    expect(crypt.grid.terrain(0, 0)).toBe('wall')
    expect(crypt.grid.terrain(1, 0)).toBe('wall')
    expect(hasEdge(crypt.gridLines, [0, 0], [1, 0])).toBe(false)
    expect(crypt.rims.length).toBeGreaterThan(0)
  })

  it('marks steps between whole meters, on the higher side', () => {
    // The altar platform (11–12, 10–11) is 1.5 m high, the floor around it 0 m.
    const { higherA, higherB } = crypt.steps
    // Below the platform: the higher cell is above the line.
    expect(hasEdge(higherA, [11, 11], [11, 12])).toBe(true)
    // Left of the platform: the higher cell is right of the line.
    expect(hasEdge(higherB, [10, 11], [11, 11])).toBe(true)
    expect(hasEdge(higherA, [10, 11], [11, 11])).toBe(false)
    // No step inside the platform or on level floor.
    expect(hasEdge(higherA, [11, 10], [11, 11])).toBe(false)
    expect(hasEdge(higherB, [9, 12], [10, 12])).toBe(false)
  })

  it('groups every non-void cell into a terrain fill', () => {
    const river = buildScene((riverFixture as BoardState).map)
    const filled = river.fills.reduce((sum, group) => sum + group.cells.length / 2, 0)
    expect(filled).toBe(river.baseCells.length / 2)
    expect(river.waterRuns.length).toBeGreaterThan(0)
  })

  it('finds entrances by cell and the edge they lead out through', () => {
    expect(gorge.entranceAt(0, 5)?.label).toBe('Waldweg')
    expect(gorge.entranceAt(1, 5)).toBeUndefined()
    expect(gorge.entrances[0]!.side).toBe('left')
  })
})

describe('entranceSide', () => {
  it('picks the edge most cells lie on', () => {
    expect(
      entranceSide(
        [
          [11, 15],
          [12, 15],
        ],
        24,
        16,
      ),
    ).toBe('bottom')
    expect(
      entranceSide(
        [
          [39, 34],
          [39, 35],
        ],
        40,
        38,
      ),
    ).toBe('right')
    // A corner cell counts for both edges; the neighbour decides.
    expect(
      entranceSide(
        [
          [0, 0],
          [1, 0],
        ],
        10,
        10,
      ),
    ).toBe('top')
    expect(entranceSide([[4, 4]], 10, 10)).toBeNull()
  })
})

describe('featureStyle', () => {
  it('recognises kinds in English and German', () => {
    expect(featureStyle({ kind: 'bridge', blocksMovement: false })).toBe('bridge')
    expect(featureStyle({ kind: 'Hängebrücke', blocksMovement: false })).toBe('bridge')
    expect(featureStyle({ kind: 'Falltür', blocksMovement: false })).toBe('door')
    expect(featureStyle({ kind: 'tree', blocksMovement: true })).toBe('tree')
    expect(featureStyle({ kind: 'wagon', blocksMovement: true })).toBe('wood')
    expect(featureStyle({ kind: 'well', blocksMovement: true })).toBe('well')
  })

  it('falls back to a stone block or a plain surface', () => {
    expect(featureStyle({ kind: 'standing stones', blocksMovement: true })).toBe('stone')
    expect(featureStyle({ kind: 'Motor', blocksMovement: true })).toBe('stone')
    expect(featureStyle({ kind: 'rug', blocksMovement: false })).toBe('surface')
  })
})

describe('elevationShade', () => {
  it('lightens higher ground a little per meter and darkens lower ground', () => {
    expect(elevationShade(0)).toBe(0)
    expect(elevationShade(0.2)).toBe(0)
    expect(elevationShade(1)).toBeCloseTo(0.035)
    expect(elevationShade(3)).toBeGreaterThan(elevationShade(1.5))
    expect(elevationShade(50)).toBe(0.2)
    expect(elevationShade(-2)).toBeLessThan(0)
  })
})

describe('buildHighlight', () => {
  it('keeps cells inside the map and outlines each patch', () => {
    const keys = new Set([cellKey(0, 0), cellKey(1, 0), cellKey(5, 5), cellKey(-1, 0), 'x'])
    const highlight = buildHighlight(keys, 4, 4)!
    expect(highlight.cells).toEqual([0, 0, 1, 0])
    // A 2×1 patch: top and bottom lines plus two sides.
    expect(highlight.outline).toHaveLength(4)
  })

  it('is null without cells', () => {
    expect(buildHighlight(undefined, 4, 4)).toBeNull()
    expect(buildHighlight(new Set(), 4, 4)).toBeNull()
    expect(buildHighlight(new Set([cellKey(9, 9)]), 4, 4)).toBeNull()
  })
})
