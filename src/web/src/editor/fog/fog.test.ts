import { beforeEach, describe, expect, it } from 'vitest'
import type { FogDocument, LayoutEntrance } from '../../api/types'
import { playableCells } from '../../fog/cells'
import { feature, floor, mapWith, roomCells } from '../features/fixtures'
import { at, click, dragTo, emptyEncounter, encounterFixture, key } from '../encounter/testing'
import { fogTool } from './tool'
import { resetFogOptions, useFogOptions } from './options'
import {
  createArea,
  deleteDocArea,
  entrancesInFog,
  hideAll,
  paintDocFog,
  redrawDocArea,
  renameDocArea,
  revealAll,
  turnFogOff,
  turnFogOn,
} from './ops'

const room = mapWith([], roomCells())
const playable = playableCells(room)
const fogged = (hidden: number[][], areas: FogDocument['areas'] = []) =>
  emptyEncounter({ fog: { hiddenCells: hidden, areas } })
const keys = (...pairs: [number, number][]) => new Set(pairs.map(([x, y]) => `${x},${y}`))

beforeEach(() => resetFogOptions())

describe('fog ops', () => {
  it('turning fog on hides the whole map, and does nothing when it is already on', () => {
    const on = turnFogOn(emptyEncounter(), playable)
    expect(on.fog?.hiddenCells).toHaveLength(80)
    expect(on.fog?.areas).toEqual([])
    expect(turnFogOn(on, playable)).toBe(on)
  })

  it('only lists cells of the map: void is never hidden', () => {
    const cells = roomCells().filter((c) => c.x < 5)
    const map = mapWith([], cells)
    expect(turnFogOn(emptyEncounter(), playableCells(map)).fog?.hiddenCells).toHaveLength(40)
  })

  it('a cell under a feature that bridges void counts as part of the map', () => {
    const map = mapWith([feature('f1', 0, 0, 1, 1, { blocksMovement: false })], [floor(1, 0)])
    expect(playableCells(map)).toEqual(keys([0, 0], [1, 0]))
  })

  it('turning fog off drops it, areas included', () => {
    const doc = fogged([[1, 1]], [{ id: 'a1', name: 'Nord', cells: [[1, 1]] }])
    expect(turnFogOff(doc).fog).toBeNull()
    const off = emptyEncounter()
    expect(turnFogOff(off)).toBe(off)
  })

  it('paints: reveals hidden cells and hides revealed ones, unchanged when nothing changes', () => {
    const doc = fogged([
      [0, 0],
      [1, 0],
    ])
    expect(paintDocFog(doc, keys([0, 0]), true).fog?.hiddenCells).toEqual([[1, 0]])
    expect(paintDocFog(doc, keys([2, 0]), false).fog?.hiddenCells).toEqual([
      [0, 0],
      [1, 0],
      [2, 0],
    ])
    expect(paintDocFog(doc, keys([5, 5]), true)).toBe(doc)
    expect(paintDocFog(doc, keys([0, 0]), false)).toBe(doc)
    const off = emptyEncounter()
    expect(paintDocFog(off, keys([0, 0]), true)).toBe(off)
  })

  it('reveals all and hides all, keeping the areas', () => {
    const areas = [{ id: 'a1', name: 'Nord', cells: [[1, 1]] }]
    const doc = fogged([[1, 1]], areas)
    const open = revealAll(doc)
    expect(open.fog).toEqual({ hiddenCells: [], areas })
    expect(revealAll(open)).toBe(open)
    const closed = hideAll(open, playable)
    expect(closed.fog?.hiddenCells).toHaveLength(80)
    expect(closed.fog?.areas).toEqual(areas)
    expect(hideAll(closed, playable)).toBe(closed)
  })

  it('creates, renames, redraws and deletes areas', () => {
    let doc = fogged([])
    doc = createArea(doc, '  Nordkammer ', keys([1, 1], [2, 1]), playable)
    expect(doc.fog?.areas).toEqual([
      {
        id: 'a1',
        name: 'Nordkammer',
        cells: [
          [1, 1],
          [2, 1],
        ],
      },
    ])
    doc = renameDocArea(doc, 'a1', 'Gruft')
    expect(doc.fog?.areas[0]?.name).toBe('Gruft')
    doc = redrawDocArea(doc, 'a1', keys([3, 3], [20, 20]), playable)
    expect(doc.fog?.areas[0]?.cells).toEqual([[3, 3]])
    doc = deleteDocArea(doc, 'a1')
    expect(doc.fog?.areas).toEqual([])
  })

  it('refuses bad names and empty selections', () => {
    const doc = fogged([])
    expect(createArea(doc, '   ', keys([1, 1]), playable)).toBe(doc)
    expect(createArea(doc, 'Nord', keys(), playable)).toBe(doc)
    expect(createArea(doc, 'Nord', keys([40, 40]), playable)).toBe(doc)
    expect(createArea(doc, 'x'.repeat(41), keys([1, 1]), playable)).toBe(doc)
    const off = emptyEncounter()
    expect(createArea(off, 'Nord', keys([1, 1]), playable)).toBe(off)
  })

  it('notes an entrance that lies entirely in fog, not one with a revealed cell', () => {
    const entrances: LayoutEntrance[] = [
      { id: 'e1', label: 'Tor', cells: [[0, 0]] } as unknown as LayoutEntrance,
      {
        id: 'e2',
        label: 'Tür',
        cells: [
          [5, 5],
          [6, 5],
        ],
      } as unknown as LayoutEntrance,
    ]
    const layout = { ...room.layout, entrances }
    const fog: FogDocument = {
      hiddenCells: [
        [0, 0],
        [5, 5],
      ],
      areas: [],
    }
    expect(entrancesInFog(layout, fog).map((e) => e.id)).toEqual(['e1'])
    expect(entrancesInFog(layout, null)).toEqual([])
  })
})

describe('the Nebel tool', () => {
  const hidden = (f: ReturnType<typeof encounterFixture>) =>
    f.encounter.getState().doc.fog?.hiddenCells ?? []
  const overlay = (f: ReturnType<typeof encounterFixture>) => f.map.getState().overlay

  function open(
    doc = fogged([
      [0, 0],
      [1, 0],
      [2, 0],
      [4, 4],
    ]),
  ) {
    const f = encounterFixture(doc)
    fogTool.onActivate?.(f.ctx)
    return f
  }

  it('is registered in the encounter group with the key n', () => {
    expect([fogTool.id, fogTool.group, fogTool.shortcut]).toEqual(['fog', 'encounter', 'n'])
  })

  it('does nothing while fog is off', () => {
    const f = encounterFixture()
    fogTool.onActivate?.(f.ctx)
    click(fogTool, f, 1, 1)
    expect(f.encounter.getState().doc.fog).toBeUndefined()
  })

  it('the brush reveals the cells of a stroke as one undo step', () => {
    const f = open()
    dragTo(fogTool, f, [0, 0], [2, 0])
    expect(hidden(f)).toEqual([[4, 4]])
    f.encounter.getState().undo()
    expect(hidden(f)).toHaveLength(4)
  })

  it('previews the stroke until the pointer is released, without changing the fog', () => {
    const f = open()
    fogTool.onPointerDown?.(at(0, 0, { pressed: true }), f.ctx)
    fogTool.onPointerMove?.(at(2, 0, { pressed: true }), f.ctx)
    expect(overlay(f)).toEqual([
      {
        kind: 'cells',
        cells: [
          { x: 0, y: 0 },
          { x: 1, y: 0 },
          { x: 2, y: 0 },
        ],
        style: 'paint',
      },
    ])
    expect(hidden(f)).toHaveLength(4)
    fogTool.onPointerUp?.(at(2, 0), f.ctx)
    expect(hidden(f)).toEqual([[4, 4]])
  })

  it('"Verdecken" hides the stroke and previews it as erasing', () => {
    const f = open()
    useFogOptions.getState().setReveal(false)
    fogTool.onPointerDown?.(at(6, 6, { pressed: true }), f.ctx)
    expect(overlay(f)[0]).toMatchObject({ style: 'erase' })
    fogTool.onPointerUp?.(at(6, 6), f.ctx)
    expect(hidden(f)).toContainEqual([6, 6])
  })

  it('the rectangle covers the cells between two corners', () => {
    const f = open()
    useFogOptions.getState().setShape('rect')
    dragTo(fogTool, f, [0, 0], [2, 1])
    expect(hidden(f)).toEqual([[4, 4]])
  })

  it('the fill takes the connected fog, or the open space around a revealed cell', () => {
    const f = open()
    useFogOptions.getState().setShape('fill')
    click(fogTool, f, 1, 0)
    expect(hidden(f)).toEqual([[4, 4]])
    // The open space around a revealed cell is hidden whole, up to the last hidden cell.
    useFogOptions.getState().setReveal(false)
    click(fogTool, f, 0, 0)
    expect(hidden(f)).toHaveLength(80)
  })

  it('chooses cells for an area instead of changing the fog while selecting', () => {
    const f = open()
    useFogOptions.getState().setSelecting(true)
    dragTo(fogTool, f, [0, 0], [1, 0])
    expect(hidden(f)).toHaveLength(4)
    expect([...useFogOptions.getState().selection]).toEqual(['0,0', '1,0'])
    // Painting the same cells again takes them out.
    dragTo(fogTool, f, [0, 0], [1, 0])
    expect(useFogOptions.getState().selection.size).toBe(0)
  })

  it('shows the chosen cells and the highlighted area on the canvas', () => {
    const f = open(fogged([[0, 0]], [{ id: 'a1', name: 'Nord', cells: [[3, 3]] }]))
    useFogOptions.getState().highlight('a1')
    expect(overlay(f)).toEqual([{ kind: 'cells', cells: [{ x: 3, y: 3 }], style: 'select' }])
    useFogOptions.getState().setSelection(keys([1, 1]))
    expect(overlay(f)).toHaveLength(2)
  })

  it('paints nothing in a read-only encounter', () => {
    const f = encounterFixture(fogged([[0, 0]]), room, { readOnly: true })
    fogTool.onActivate?.(f.ctx)
    click(fogTool, f, 0, 0)
    expect(hidden(f)).toEqual([[0, 0]])
  })

  it('ignores void cells', () => {
    const f = encounterFixture(
      fogged([[0, 0]]),
      mapWith(
        [],
        roomCells().filter((c) => c.x !== 5),
      ),
    )
    fogTool.onActivate?.(f.ctx)
    useFogOptions.getState().setReveal(false)
    click(fogTool, f, 5, 0)
    expect(hidden(f)).toEqual([[0, 0]])
  })

  it('Escape drops the stroke, then the chosen cells, then lets the editor have it', () => {
    const f = open()
    useFogOptions.getState().setSelection(keys([1, 1]))
    fogTool.onPointerDown?.(at(0, 0, { pressed: true }), f.ctx)
    expect(key(fogTool, f, 'Escape')).toBe(true)
    fogTool.onPointerUp?.(at(0, 0), f.ctx)
    expect(hidden(f)).toHaveLength(4)
    expect(key(fogTool, f, 'Escape')).toBe(true)
    expect(useFogOptions.getState().selection.size).toBe(0)
    expect(key(fogTool, f, 'Escape')).toBe(false)
  })

  it('clears the overlay when it is switched off', () => {
    const f = open()
    useFogOptions.getState().setSelection(keys([1, 1]))
    expect(overlay(f)).toHaveLength(1)
    fogTool.onDeactivate?.(f.ctx)
    expect(overlay(f)).toEqual([])
  })
})
