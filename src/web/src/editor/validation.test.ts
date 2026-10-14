import { describe, expect, it } from 'vitest'
import type { MapLayout } from '../api/types'
import { LAYOUT_SCHEMA_VERSION, type EditorMap } from './model'
import cases from './validation.cases.json'
import {
  checkLayout,
  isEdgeCell,
  problemTarget,
  rectInside,
  rectsOverlap,
  type LayoutProblem,
} from './validation'

interface SharedCase {
  name: string
  map: Partial<Omit<EditorMap, 'layout'>> & { layout?: Partial<MapLayout> }
  expected: string[]
}

/** A case's map with the defaults the file names for fields it leaves out. */
function mapOf({ map }: SharedCase): EditorMap {
  return {
    name: 'Testkarte',
    width: 0,
    height: 0,
    scene: '',
    vibe: '',
    lighting: '',
    ...map,
    layout: {
      schemaVersion: LAYOUT_SCHEMA_VERSION,
      cells: [],
      features: [],
      entrances: [],
      ...map.layout,
    },
  }
}

const codes = (problems: LayoutProblem[]) => problems.map((p) => p.code).sort()

describe('checkLayout, shared cases', () => {
  it.each((cases.cases as unknown as SharedCase[]).map((c) => [c.name, c] as const))(
    '%s',
    (_, sharedCase) => {
      expect(codes(checkLayout(mapOf(sharedCase)))).toEqual([...sharedCase.expected].sort())
    },
  )

  it('has unique case names', () => {
    const names = cases.cases.map((c) => c.name)
    expect(new Set(names).size).toBe(names.length)
  })
})

describe('checkLayout, problem details', () => {
  const base = mapOf({ name: '', map: { width: 6, height: 4 }, expected: [] })
  const floor = (x: number, y: number) => ({ x, y, terrain: 'floor' as const, elevation: 0 })

  it('names the later feature of an overlap and the earlier one as other', () => {
    const feature = (id: string, x: number) => ({
      id,
      kind: 'Säule',
      label: '',
      x,
      y: 0,
      w: 2,
      h: 1,
      elevation: 0,
      blocksMovement: true,
    })
    const problems = checkLayout({
      ...base,
      layout: { ...base.layout, features: [feature('f1', 0), feature('f2', 1)] },
    })
    expect(problems).toEqual([
      { code: 'featureOverlap', item: { kind: 'feature', index: 1, id: 'f2' }, otherId: 'f1' },
    ])
    expect(problemTarget(problems[0]!)).toEqual({ kind: 'feature', id: 'f2' })
  })

  it('names the entrance cell and the entrance that has it already', () => {
    const problems = checkLayout({
      ...base,
      layout: {
        ...base.layout,
        cells: [floor(0, 1), floor(0, 2)],
        entrances: [
          { id: 'e1', kind: 'entrance', label: '', cells: [[0, 1]] },
          {
            id: 'e2',
            kind: 'exit',
            label: '',
            cells: [
              [0, 1],
              [0, 2],
            ],
          },
        ],
      },
    })
    expect(problems).toEqual([
      {
        code: 'entranceCellShared',
        item: { kind: 'entrance', index: 1, id: 'e2' },
        cell: { x: 0, y: 1 },
        otherId: 'e1',
      },
    ])
  })

  it('names the text that is too long and points at cells by position', () => {
    const problems = checkLayout({
      ...base,
      scene: 'x'.repeat(501),
      layout: { ...base.layout, cells: [floor(7, 1)] },
    })
    expect(problems).toEqual([
      { code: 'textTooLong', item: { kind: 'map' }, field: 'scene' },
      { code: 'cellOutside', item: { kind: 'cell', index: 0, x: 7, y: 1 } },
    ])
    expect(problemTarget(problems[0]!)).toBeNull()
  })
})

describe('layout rule helpers', () => {
  it('knows the outer edge', () => {
    expect(isEdgeCell(0, 2, 6, 4)).toBe(true)
    expect(isEdgeCell(5, 3, 6, 4)).toBe(true)
    expect(isEdgeCell(2, 0, 6, 4)).toBe(true)
    expect(isEdgeCell(2, 2, 6, 4)).toBe(false)
    expect(isEdgeCell(6, 2, 6, 4)).toBe(false)
    expect(isEdgeCell(-1, 0, 6, 4)).toBe(false)
  })

  it('knows rectangles inside the grid and overlapping ones', () => {
    expect(rectInside({ x: 0, y: 0, w: 6, h: 4 }, 6, 4)).toBe(true)
    expect(rectInside({ x: 1, y: 0, w: 6, h: 4 }, 6, 4)).toBe(false)
    expect(rectInside({ x: 1, y: 0, w: 0, h: 1 }, 6, 4)).toBe(false)
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 1, y: 1, w: 2, h: 2 })).toBe(true)
    expect(rectsOverlap({ x: 0, y: 0, w: 2, h: 2 }, { x: 2, y: 0, w: 2, h: 2 })).toBe(false)
  })
})
