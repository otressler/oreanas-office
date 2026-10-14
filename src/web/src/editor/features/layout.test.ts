import { describe, expect, it } from 'vitest'
import { feature, floor, mapWith } from './fixtures'
import {
  addEntrance,
  addFeature,
  entranceAtCell,
  entranceCells,
  featureAtCell,
  footprintProblem,
  moveFeature,
  parseCellsInput,
  rectBetween,
  removeEntrance,
  removeFeature,
  removeItem,
  updateEntrance,
  updateFeature,
} from './layout'

describe('feature footprints', () => {
  it('spans a rectangle between two corners in either order', () => {
    expect(rectBetween({ x: 4, y: 1 }, { x: 2, y: 3 })).toEqual({ x: 2, y: 1, w: 3, h: 3 })
    expect(rectBetween({ x: 2, y: 2 }, { x: 2, y: 2 })).toEqual({ x: 2, y: 2, w: 1, h: 1 })
  })

  it('may lie over void and walls but not outside the grid', () => {
    const map = mapWith([], [{ x: 3, y: 3, terrain: 'wall', elevation: 0 }])
    expect(footprintProblem(map, { x: 2, y: 3, w: 3, h: 1 })).toBeNull()
    expect(footprintProblem(map, { x: 0, y: 0, w: 10, h: 8 })).toBeNull()
    expect(footprintProblem(map, { x: 8, y: 0, w: 3, h: 1 })).toBe('outside')
    expect(footprintProblem(map, { x: -1, y: 0, w: 1, h: 1 })).toBe('outside')
    expect(footprintProblem(map, { x: 0, y: 7, w: 1, h: 2 })).toBe('outside')
    expect(footprintProblem(map, { x: 0, y: 0, w: 0, h: 1 })).toBe('outside')
  })

  it('may not overlap another feature, except the one being moved', () => {
    const map = mapWith([feature('f1', 2, 2, 2, 2)])
    expect(footprintProblem(map, { x: 3, y: 3, w: 2, h: 1 })).toBe('overlap')
    expect(footprintProblem(map, { x: 4, y: 2, w: 2, h: 2 })).toBeNull()
    expect(footprintProblem(map, { x: 3, y: 3, w: 2, h: 1 }, 'f1')).toBeNull()
  })

  it('finds the feature on top at a cell', () => {
    const map = mapWith([feature('f1', 0, 0, 3, 3), feature('f2', 1, 1)])
    expect(featureAtCell(map, { x: 1, y: 1 })?.id).toBe('f2')
    expect(featureAtCell(map, { x: 2, y: 2 })?.id).toBe('f1')
    expect(featureAtCell(map, { x: 3, y: 3 })).toBeUndefined()
  })
})

describe('feature changes', () => {
  it('adds a feature with the next free id', () => {
    const map = mapWith([feature('f1', 0, 0), feature('f3', 1, 0)])
    const { map: next, id } = addFeature(map, { ...feature('', 4, 4), kind: 'Brücke' })
    expect(id).toBe('f4')
    expect(next.layout.features.at(-1)).toMatchObject({ id: 'f4', kind: 'Brücke', x: 4, y: 4 })
    expect(map.layout.features).toHaveLength(2)
  })

  it('keeps the same map when nothing changes', () => {
    const map = mapWith([feature('f1', 0, 0)])
    expect(updateFeature(map, 'f1', { x: 0, kind: 'Säule' })).toBe(map)
    expect(updateFeature(map, 'nope', { x: 3 })).toBe(map)
    expect(moveFeature(map, 'f1', { x: 0, y: 0 })).toBe(map)
    expect(removeFeature(map, 'nope')).toBe(map)
    expect(removeEntrance(map, 'nope')).toBe(map)
  })

  it('moves, changes and removes features', () => {
    const map = mapWith([feature('f1', 0, 0), feature('f2', 5, 5)])
    expect(moveFeature(map, 'f1', { x: 2, y: 3 }).layout.features[0]).toMatchObject({ x: 2, y: 3 })
    expect(updateFeature(map, 'f2', { label: 'Alte Säule' }).layout.features[1]!.label).toBe(
      'Alte Säule',
    )
    expect(removeItem(map, { kind: 'feature', id: 'f1' }).layout.features.map((f) => f.id)).toEqual(
      ['f2'],
    )
  })
})

describe('entrances', () => {
  // Floor on the left column, a wall at (9, 0), a bridge over void along row 4, a
  // blocking pillar on floor at (0, 7).
  const cells = [...Array.from({ length: 8 }, (_, y) => floor(0, y)), floor(9, 1)]
  cells.push({ x: 9, y: 0, terrain: 'wall', elevation: 0 })
  const map = mapWith(
    [feature('f1', 1, 4, 9, 1, { kind: 'Brücke', blocksMovement: false }), feature('f2', 0, 7)],
    cells,
  )

  it('takes edge cells a token may stand on and refuses the rest', () => {
    const { take, refuse } = entranceCells(map, [
      { x: 0, y: 1 }, // floor on the edge
      { x: 9, y: 4 }, // bridge over void on the edge
      { x: 9, y: 1 }, // floor on the right edge
      { x: 9, y: 0 }, // wall
      { x: 5, y: 0 }, // void
      { x: 0, y: 7 }, // under a blocking pillar
      { x: 1, y: 4 }, // bridge, but not on the edge
      { x: -1, y: 2 }, // outside
    ])
    expect(take).toEqual([
      { x: 0, y: 1 },
      { x: 9, y: 4 },
      { x: 9, y: 1 },
    ])
    expect(refuse).toHaveLength(5)
  })

  it('refuses cells another entrance has, and lists each cell once', () => {
    const { map: withEntrance, id } = addEntrance(map, {
      kind: 'exit',
      label: 'Waldweg',
      cells: [
        { x: 0, y: 2 },
        { x: 0, y: 3 },
      ],
    })
    expect(id).toBe('e1')
    expect(withEntrance.layout.entrances[0]).toEqual({
      id: 'e1',
      kind: 'exit',
      label: 'Waldweg',
      cells: [
        [0, 2],
        [0, 3],
      ],
    })
    expect(entranceAtCell(withEntrance, { x: 0, y: 3 })?.id).toBe('e1')
    const { take, refuse } = entranceCells(withEntrance, [
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 1 },
    ])
    expect(take).toEqual([{ x: 0, y: 1 }])
    expect(refuse).toEqual([{ x: 0, y: 2 }])

    const changed = updateEntrance(withEntrance, 'e1', { kind: 'both' })
    expect(changed.layout.entrances[0]!.kind).toBe('both')
    expect(updateEntrance(withEntrance, 'e1', { kind: 'exit', label: 'Waldweg' })).toBe(
      withEntrance,
    )
    expect(removeItem(withEntrance, { kind: 'entrance', id: 'e1' }).layout.entrances).toEqual([])
  })
})

describe('typed numbers', () => {
  it('reads whole cell numbers', () => {
    expect(parseCellsInput(' 4 ')).toBe(4)
    expect(parseCellsInput('-1')).toBe(-1)
    expect(parseCellsInput('1,5')).toBeNull()
    expect(parseCellsInput('')).toBeNull()
  })
})
