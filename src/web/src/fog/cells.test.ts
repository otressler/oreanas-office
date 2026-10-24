import { describe, expect, it } from 'vitest'
import type { FogArea } from '../api/types'
import {
  addArea,
  areaCells,
  areasAt,
  boardCells,
  brushStroke,
  cleanAreaName,
  deleteArea,
  diffFog,
  documentOf,
  effectiveCells,
  fillFrom,
  hiddenOfDocument,
  hiddenOfView,
  nextAreaId,
  paintFog,
  playableCells,
  rectangle,
  redrawArea,
  renameArea,
  trimToMap,
} from './cells'

const key = (x: number, y: number) => `${x},${y}`
const room = (w: number, h: number) => {
  const cells = new Set<string>()
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) cells.add(key(x, y))
  return cells
}
const set = (...pairs: [number, number][]) => new Set(pairs.map(([x, y]) => key(x, y)))

describe('hidden cells', () => {
  it('reads the stored document and the board view', () => {
    expect(hiddenOfDocument({ hiddenCells: [[1, 2]], areas: [] })).toEqual(set([1, 2]))
    expect(hiddenOfView({ hiddenCells: [{ x: 3, y: 4 }] })).toEqual(set([3, 4]))
    expect(hiddenOfDocument(null).size).toBe(0)
  })

  it('writes cells in reading order', () => {
    const doc = documentOf(set([2, 1], [0, 0], [1, 1]), [])
    expect(doc.hiddenCells).toEqual([
      [0, 0],
      [1, 1],
      [2, 1],
    ])
    expect(boardCells(set([1, 0], [0, 0]))).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ])
  })

  it('leaves void out of the playable cells, but not a feature over void', () => {
    const map = {
      width: 3,
      height: 1,
      layout: {
        schemaVersion: 1,
        cells: [{ x: 0, y: 0, terrain: 'floor' as const, elevation: 0 }],
        features: [
          {
            id: 'f1',
            kind: 'Brücke',
            label: '',
            x: 1,
            y: 0,
            w: 1,
            h: 1,
            elevation: 0,
            blocksMovement: false,
          },
        ],
        entrances: [],
      },
    }
    expect(playableCells(map)).toEqual(set([0, 0], [1, 0]))
  })
})

describe('painting', () => {
  const playable = room(6, 4)

  it('brushes a line of cells and stays on the map', () => {
    expect(brushStroke({ x: 0, y: 0 }, { x: 2, y: 0 }, playable)).toEqual(
      set([0, 0], [1, 0], [2, 0]),
    )
    expect(brushStroke({ x: 4, y: 0 }, { x: 8, y: 0 }, playable)).toEqual(set([4, 0], [5, 0]))
  })

  it('fills a rectangle between two corners in any order, cut to the map', () => {
    const map = { width: 6, height: 4 }
    expect(rectangle(map, { x: 2, y: 1 }, { x: 1, y: 0 }, playable)).toEqual(
      set([1, 0], [2, 0], [1, 1], [2, 1]),
    )
    // Cells that are void are not part of the rectangle.
    const holes = room(6, 4)
    holes.delete(key(1, 0))
    expect(rectangle(map, { x: 1, y: 0 }, { x: 2, y: 0 }, holes)).toEqual(set([2, 0]))
  })

  it('fills the connected cells that are hidden like the start cell', () => {
    // A wall of revealed cells at x = 2 splits the fog in two.
    const hidden = room(6, 4)
    for (let y = 0; y < 4; y++) hidden.delete(key(2, y))
    const left = fillFrom({ x: 0, y: 0 }, hidden, playable)
    expect(left.size).toBe(8)
    expect([...left].every((k) => Number(k.split(',')[0]) < 2)).toBe(true)
    // A click on the revealed column takes the column.
    expect(fillFrom({ x: 2, y: 1 }, hidden, playable).size).toBe(4)
    expect(fillFrom({ x: 9, y: 9 }, hidden, playable).size).toBe(0)
  })

  it('reveals and hides, and returns the same set when nothing changes', () => {
    const hidden = set([0, 0], [1, 0])
    expect(paintFog(hidden, set([0, 0]), true)).toEqual(set([1, 0]))
    expect(paintFog(hidden, set([2, 0]), false)).toEqual(set([0, 0], [1, 0], [2, 0]))
    expect(paintFog(hidden, set([0, 0]), false)).toBe(hidden)
    expect(paintFog(hidden, set([5, 5]), true)).toBe(hidden)
  })

  it('counts only the cells a change really changes', () => {
    const hidden = set([0, 0], [1, 0])
    expect(effectiveCells(hidden, set([0, 0], [2, 0]), true)).toEqual(set([0, 0]))
    expect(effectiveCells(hidden, set([0, 0], [2, 0]), false)).toEqual(set([2, 0]))
  })

  it('says what a change revealed and hid', () => {
    expect(diffFog(set([0, 0], [1, 0]), set([1, 0], [2, 0]))).toEqual({
      revealed: [key(0, 0)],
      hidden: [key(2, 0)],
    })
  })
})

describe('areas', () => {
  const playable = room(6, 4)
  const north: FogArea = {
    id: 'a1',
    name: 'Nordkammer',
    cells: [
      [0, 0],
      [1, 0],
    ],
  }

  it('adds an area from cells with a free id and a trimmed name', () => {
    const areas = addArea([north], '  Hof ', set([3, 3], [9, 9]), playable)
    expect(areas).toHaveLength(2)
    expect(areas[1]).toEqual({ id: 'a2', name: 'Hof', cells: [[3, 3]] })
  })

  it('refuses an area without cells or a bad name', () => {
    const areas = [north]
    expect(addArea(areas, 'Hof', set(), playable)).toBe(areas)
    expect(addArea(areas, '   ', set([1, 1]), playable)).toBe(areas)
    expect(addArea(areas, 'x'.repeat(41), set([1, 1]), playable)).toBe(areas)
    expect(cleanAreaName('Ost')).toBe('Ost')
  })

  it('does not reuse an id that is taken', () => {
    expect(nextAreaId([{ id: 'a2', name: 'x', cells: [] }])).toBe('a3')
    expect(nextAreaId([north, { id: 'a2', name: 'y', cells: [] }])).toBe('a3')
  })

  it('renames, redraws and deletes by id', () => {
    expect(renameArea([north], 'a1', ' Süd ')[0]!.name).toBe('Süd')
    expect(renameArea([north], 'a1', 'Nordkammer')).toEqual([north])
    expect(renameArea([north], 'a1', '')[0]).toBe(north)
    const redrawn = redrawArea([north], 'a1', set([4, 2], [5, 2]), playable)
    expect(redrawn[0]!.cells).toEqual([
      [4, 2],
      [5, 2],
    ])
    expect(redrawArea([north], 'a1', set(), playable)[0]).toBe(north)
    expect(deleteArea([north], 'a1')).toEqual([])
    const kept = [north]
    expect(deleteArea(kept, 'zz')).toBe(kept)
  })

  it('finds the areas that contain a cell, in drawing order', () => {
    const both: FogArea = {
      id: 'a2',
      name: 'Halle',
      cells: [
        [1, 0],
        [2, 0],
      ],
    }
    expect(areasAt([north, both], { x: 1, y: 0 }).map((a) => a.id)).toEqual(['a1', 'a2'])
    expect(areasAt([north, both], { x: 2, y: 0 }).map((a) => a.id)).toEqual(['a2'])
    expect(areasAt([north, both], { x: 5, y: 5 })).toEqual([])
    expect(areaCells(north)).toEqual(set([0, 0], [1, 0]))
  })

  it('drops cells that fell off the map', () => {
    const fog = {
      hiddenCells: [
        [0, 0],
        [9, 9],
      ],
      areas: [
        {
          ...north,
          cells: [
            [0, 0],
            [9, 9],
          ],
        },
      ],
    }
    const trimmed = trimToMap(fog, playable)
    expect(trimmed.hiddenCells).toEqual([[0, 0]])
    expect(trimmed.areas[0]!.cells).toEqual([[0, 0]])
    const clean = { hiddenCells: [[0, 0]], areas: [north] }
    expect(trimToMap(clean, playable)).toBe(clean)
  })
})
