import { describe, expect, it } from 'vitest'
import type { LayoutCell, LayoutEntrance, LayoutFeature } from '../../api/types'
import { emptyMap, type EditorMap } from '../model'
import {
  canResize,
  elevationLabels,
  floodArea,
  formatElevationInput,
  lineCells,
  paintElevation,
  paintTerrain,
  parseElevation,
  rectBetween,
  rectCells,
  resizeLosses,
  resizeMap,
  terrainAt,
} from './layout'

function mapWith(
  cells: LayoutCell[],
  extra: { features?: LayoutFeature[]; entrances?: LayoutEntrance[] } = {},
  width = 10,
  height = 8,
): EditorMap {
  const doc = emptyMap('Klamm', width, height)
  return {
    ...doc,
    layout: {
      ...doc.layout,
      cells,
      features: extra.features ?? [],
      entrances: extra.entrances ?? [],
    },
  }
}

const cell = (x: number, y: number, terrain: LayoutCell['terrain'] = 'floor', elevation = 0) => ({
  x,
  y,
  terrain,
  elevation,
})

const feature = (id: string, x: number, y: number, w: number, h: number): LayoutFeature => ({
  id,
  kind: 'bridge',
  label: '',
  x,
  y,
  w,
  h,
  elevation: 0,
  blocksMovement: false,
})

describe('paintTerrain', () => {
  it('adds cells sorted by row, then column', () => {
    const doc = paintTerrain(
      mapWith([]),
      [
        { x: 3, y: 1 },
        { x: 1, y: 2 },
        { x: 0, y: 1 },
      ],
      'floor',
    )
    expect(doc.layout.cells).toEqual([cell(0, 1), cell(3, 1), cell(1, 2)])
  })

  it('keeps a cell’s elevation when it gets another terrain', () => {
    const doc = paintTerrain(mapWith([cell(2, 2, 'floor', 1.5)]), [{ x: 2, y: 2 }], 'water')
    expect(doc.layout.cells).toEqual([cell(2, 2, 'water', 1.5)])
  })

  it('removes cells painted void, with their elevation', () => {
    const doc = paintTerrain(
      mapWith([cell(1, 1, 'floor', 3), cell(2, 1)]),
      [{ x: 1, y: 1 }],
      'void',
    )
    expect(doc.layout.cells).toEqual([cell(2, 1)])
    expect(paintTerrain(doc, [{ x: 1, y: 1 }], 'floor').layout.cells[0]).toEqual(cell(1, 1))
  })

  it('lists each cell once, even when painted twice', () => {
    const doc = paintTerrain(
      mapWith([]),
      [
        { x: 1, y: 1 },
        { x: 1, y: 1 },
      ],
      'wall',
    )
    expect(doc.layout.cells).toEqual([cell(1, 1, 'wall')])
  })

  it('skips cells outside the map', () => {
    const doc = mapWith([])
    expect(
      paintTerrain(
        doc,
        [
          { x: -1, y: 0 },
          { x: 10, y: 0 },
          { x: 0, y: 8 },
        ],
        'floor',
      ),
    ).toBe(doc)
  })

  it('returns the same map when nothing changes', () => {
    const doc = mapWith([cell(1, 1)])
    expect(paintTerrain(doc, [{ x: 1, y: 1 }], 'floor')).toBe(doc)
    expect(paintTerrain(doc, [{ x: 4, y: 4 }], 'void')).toBe(doc)
  })
})

describe('paintElevation', () => {
  it('sets the elevation on map cells and skips void', () => {
    const doc = paintElevation(
      mapWith([cell(1, 1), cell(2, 1, 'wall')]),
      [
        { x: 1, y: 1 },
        { x: 2, y: 1 },
        { x: 3, y: 1 },
      ],
      -1.5,
    )
    expect(doc.layout.cells).toEqual([cell(1, 1, 'floor', -1.5), cell(2, 1, 'wall', -1.5)])
  })

  it('returns the same map when nothing changes', () => {
    const doc = mapWith([cell(1, 1, 'floor', 3)])
    expect(paintElevation(doc, [{ x: 1, y: 1 }], 3)).toBe(doc)
    expect(paintElevation(doc, [{ x: 5, y: 5 }], 1.5)).toBe(doc)
  })
})

describe('lineCells', () => {
  it('connects two cells without gaps', () => {
    expect(lineCells({ x: 0, y: 0 }, { x: 4, y: 0 })).toEqual([
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ])
    expect(lineCells({ x: 3, y: 3 }, { x: 0, y: 0 })).toHaveLength(4)
    const steep = lineCells({ x: 0, y: 0 }, { x: 2, y: 5 })
    expect(steep).toHaveLength(6)
    expect(steep.at(-1)).toEqual({ x: 2, y: 5 })
    for (let i = 1; i < steep.length; i++) {
      expect(Math.abs(steep[i]!.x - steep[i - 1]!.x)).toBeLessThanOrEqual(1)
      expect(Math.abs(steep[i]!.y - steep[i - 1]!.y)).toBe(1)
    }
  })

  it('is a single cell from a cell to itself', () => {
    expect(lineCells({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual([{ x: 2, y: 2 }])
  })
})

describe('rectBetween', () => {
  it('spans two corners in any order and clips to the map', () => {
    const doc = mapWith([])
    expect(rectBetween(doc, { x: 4, y: 3 }, { x: 1, y: 1 })).toEqual({ x: 1, y: 1, w: 4, h: 3 })
    expect(rectBetween(doc, { x: -2, y: 6 }, { x: 12, y: 9 })).toEqual({ x: 0, y: 6, w: 10, h: 2 })
    expect(rectBetween(doc, { x: 11, y: 0 }, { x: 12, y: 2 })).toBeNull()
    expect(rectCells({ x: 1, y: 1, w: 2, h: 2 })).toEqual([
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ])
  })
})

describe('floodArea', () => {
  // A wall ring around a floor room; void outside.
  //   . = void, # = wall, f = floor
  //   #####
  //   #fff#
  //   #f###
  //   ###..
  const room = () => {
    const rows = ['#####', '#fff#', '#f###', '###..']
    const cells: LayoutCell[] = []
    rows.forEach((row, y) =>
      [...row].forEach((ch, x) => {
        if (ch !== '.') cells.push(cell(x, y, ch === '#' ? 'wall' : 'floor'))
      }),
    )
    return mapWith(cells, {}, 5, 4)
  }

  it('fills the connected area of the same terrain, four neighbours', () => {
    const area = floodArea(room(), { x: 2, y: 1 })
    expect(area).toHaveLength(4)
    expect(area).toContainEqual({ x: 1, y: 2 })
  })

  it('counts void as a terrain and stays inside the map', () => {
    expect(floodArea(room(), { x: 4, y: 3 })).toHaveLength(2)
    expect(floodArea(mapWith([]), { x: 0, y: 0 })).toHaveLength(80)
    expect(floodArea(room(), { x: 9, y: 9 })).toEqual([])
  })

  it('does not leak through diagonals', () => {
    const doc = mapWith([cell(0, 0), cell(1, 1)], {}, 2, 2)
    expect(floodArea(doc, { x: 0, y: 0 })).toEqual([{ x: 0, y: 0 }])
  })

  it('paints the filled area', () => {
    const doc = room()
    const filled = paintTerrain(doc, floodArea(doc, { x: 1, y: 1 }), 'water')
    expect(terrainAt(filled, 3, 1)).toBe('water')
    expect(terrainAt(filled, 1, 2)).toBe('water')
    expect(terrainAt(filled, 0, 0)).toBe('wall')
  })
})

describe('resizeMap', () => {
  const gorge = () =>
    mapWith([cell(0, 0), cell(5, 2, 'water', -3), cell(9, 7, 'wall')], {
      features: [feature('f1', 4, 2, 3, 1), feature('f2', 8, 6, 2, 2)],
      entrances: [
        {
          id: 'e1',
          kind: 'entrance',
          label: 'Waldweg',
          cells: [
            [0, 3],
            [0, 4],
          ],
        },
        {
          id: 'e2',
          kind: 'exit',
          label: '',
          cells: [
            [9, 6],
            [9, 7],
          ],
        },
      ],
    })

  it('grows on the left: everything shifts and the new cells are void', () => {
    const doc = resizeMap(gorge(), { left: 2, right: 0, top: 0, bottom: 0 })
    expect([doc.width, doc.height]).toEqual([12, 8])
    expect(doc.layout.cells).toEqual([cell(2, 0), cell(7, 2, 'water', -3), cell(11, 7, 'wall')])
    expect(doc.layout.features.map((f) => [f.id, f.x, f.y])).toEqual([
      ['f1', 6, 2],
      ['f2', 10, 6],
    ])
    expect(doc.layout.entrances[0]!.cells).toEqual([
      [2, 3],
      [2, 4],
    ])
    expect(terrainAt(doc, 0, 0)).toBe('void')
    expect(terrainAt(doc, 1, 0)).toBe('void')
  })

  it('shrinks: drops cells, features not completely inside, and empty entrances', () => {
    const doc = resizeMap(gorge(), { left: -1, right: -1, top: 0, bottom: -1 })
    expect([doc.width, doc.height]).toEqual([8, 7])
    expect(doc.layout.cells).toEqual([cell(4, 2, 'water', -3)])
    expect(doc.layout.features.map((f) => f.id)).toEqual(['f1'])
    expect(doc.layout.entrances).toEqual([])
  })

  it('keeps entrance cells that are left inside, even off the edge', () => {
    const doc = resizeMap(gorge(), { left: 0, right: 1, top: 0, bottom: -1 })
    expect(doc.layout.entrances.map((e) => [e.id, e.cells])).toEqual([
      [
        'e1',
        [
          [0, 3],
          [0, 4],
        ],
      ],
      ['e2', [[9, 6]]],
    ])
  })

  it('grows and shrinks at the top', () => {
    const doc = resizeMap(gorge(), { left: 0, right: 0, top: 1, bottom: 0 })
    expect(doc.layout.features[0]).toMatchObject({ x: 4, y: 3 })
    expect(resizeMap(doc, { left: 0, right: 0, top: -1, bottom: 0 }).layout).toEqual(gorge().layout)
  })

  it('leaves the map as it is outside 1 to 40 cells or without a change', () => {
    const doc = gorge()
    expect(resizeMap(doc, { left: 0, right: 0, top: 0, bottom: 0 })).toBe(doc)
    expect(resizeMap(doc, { left: -5, right: -5, top: 0, bottom: 0 })).toBe(doc)
    expect(resizeMap(doc, { left: 31, right: 0, top: 0, bottom: 0 })).toBe(doc)
    expect(canResize(doc, { left: 30, right: 0, top: 0, bottom: -7 })).toBe(true)
    expect(canResize(doc, { left: 0, right: 0, top: 0, bottom: -8 })).toBe(false)
  })

  it('counts what a resize removes', () => {
    expect(resizeLosses(gorge(), { left: 0, right: -1, top: 0, bottom: 0 })).toEqual({
      features: 1,
      entrances: 1,
    })
  })
})

describe('parseElevation', () => {
  it('reads German and English decimals, signs and a unit', () => {
    expect(parseElevation('1,5')).toBe(1.5)
    expect(parseElevation('1.5')).toBe(1.5)
    expect(parseElevation('-3')).toBe(-3)
    expect(parseElevation('−1,5')).toBe(-1.5)
    expect(parseElevation('+3')).toBe(3)
    expect(parseElevation(' 2,5 m ')).toBe(2.5)
    expect(parseElevation('0')).toBe(0)
    expect(parseElevation('-0')).toBe(0)
    expect(Object.is(parseElevation('-0'), -0)).toBe(false)
    expect(parseElevation(',5')).toBe(0.5)
    expect(parseElevation('9999,9')).toBe(9999.9)
  })

  it('rejects anything else', () => {
    for (const input of ['', '-', 'abc', '1,25', '1,5,5', '10000', '-10000', '1e3', '3 ft'])
      expect(parseElevation(input), input).toBeNull()
  })

  it('formats for the input field', () => {
    expect(formatElevationInput(1.5)).toBe('1,5')
    expect(formatElevationInput(-3)).toBe('-3')
    expect(formatElevationInput(2500)).toBe('2500')
  })
})

describe('elevationLabels', () => {
  it('labels every non-zero cell elevation, signed and short', () => {
    const doc = mapWith([cell(0, 0), cell(1, 0, 'floor', 1.5), cell(2, 0, 'water', -3)])
    expect(elevationLabels(doc)).toEqual([
      { x: 1, y: 0, text: '+1,5' },
      { x: 2, y: 0, text: '-3' },
    ])
  })
})
