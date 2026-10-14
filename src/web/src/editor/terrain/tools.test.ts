import { beforeEach, describe, expect, it } from 'vitest'
import type { LayoutCell } from '../../api/types'
import { emptyMap, type EditorMap } from '../model'
import type { Overlay } from '../store'
import { drag, editorStoreFor, pointerAt } from '../testing'
import { terrainTools } from '.'
import { terrainAt } from './layout'
import { resetPaintOptions, usePaintOptions } from './options'
import { elevationBrush, elevationRect, terrainBrush, terrainFill, terrainRect } from './tools'

const cell = (x: number, y: number, terrain: LayoutCell['terrain'] = 'floor', elevation = 0) => ({
  x,
  y,
  terrain,
  elevation,
})

function mapWith(cells: LayoutCell[]): EditorMap {
  const doc = emptyMap('Klamm', 10, 8)
  return { ...doc, layout: { ...doc.layout, cells } }
}

const key = (k: string) => new KeyboardEvent('keydown', { key: k })

beforeEach(() => resetPaintOptions())

describe('terrain tools', () => {
  it('are listed with their groups and shortcuts', () => {
    expect(terrainTools.map((tool) => [tool.id, tool.group, tool.shortcut])).toEqual([
      ['terrain-brush', 'terrain', 'b'],
      ['terrain-rect', 'terrain', 'r'],
      ['terrain-fill', 'terrain', 'f'],
      ['elevation-brush', 'elevation', 'h'],
      ['elevation-rect', 'elevation', undefined],
    ])
  })

  it('brush paints every cell of a drag and fills the gaps of a fast one, as one undo step', () => {
    const store = editorStoreFor()
    drag(terrainBrush, store, [
      [0, 0],
      [4, 0],
      [4, 2],
    ])
    const { doc, past } = store.getState()
    expect(doc.layout.cells).toEqual([
      cell(0, 0),
      cell(1, 0),
      cell(2, 0),
      cell(3, 0),
      cell(4, 0),
      cell(4, 1),
      cell(4, 2),
    ])
    expect(past).toHaveLength(1)
    store.getState().undo()
    expect(store.getState().doc.layout.cells).toEqual([])
  })

  it('brush paints void to take cells out of the map', () => {
    const store = editorStoreFor(mapWith([cell(1, 1, 'floor', 1.5), cell(2, 1)]))
    usePaintOptions.getState().setTerrain('void')
    drag(terrainBrush, store, [[1, 1]])
    expect(store.getState().doc.layout.cells).toEqual([cell(2, 1)])
  })

  it('rectangle previews as an overlay and paints on release', () => {
    const store = editorStoreFor()
    usePaintOptions.getState().setTerrain('wall')
    const ctx = { store }
    terrainRect.onPointerDown!(pointerAt(1, 1), ctx)
    terrainRect.onPointerMove!(pointerAt(3, 2), ctx)
    expect(store.getState().overlay).toEqual([
      { kind: 'rect', x: 1, y: 1, w: 3, h: 2, style: 'paint' },
    ])
    expect(store.getState().doc.layout.cells).toEqual([])
    terrainRect.onPointerUp!(pointerAt(3, 2, { pressed: false }), ctx)
    expect(store.getState().doc.layout.cells).toHaveLength(6)
    expect(terrainAt(store.getState().doc, 3, 2)).toBe('wall')
    expect(store.getState().past).toHaveLength(1)
  })

  it('rectangle stops when the drag is cancelled', () => {
    const store = editorStoreFor()
    const ctx = { store }
    terrainRect.onPointerDown!(pointerAt(1, 1), ctx)
    terrainRect.onPointerLeave!(ctx)
    terrainRect.onPointerUp!(pointerAt(3, 2, { pressed: false }), ctx)
    expect(store.getState().doc.layout.cells).toEqual([])
  })

  it('fill paints the connected area, void included', () => {
    const store = editorStoreFor(mapWith([cell(0, 0, 'wall'), cell(1, 0, 'wall')]))
    usePaintOptions.getState().setTerrain('floor')
    drag(terrainFill, store, [[5, 5]])
    const { doc } = store.getState()
    expect(doc.layout.cells).toHaveLength(80)
    expect(terrainAt(doc, 0, 0)).toBe('wall')
    expect(terrainAt(doc, 9, 7)).toBe('floor')
    expect(store.getState().past).toHaveLength(1)
  })

  it('shows a hover outline for the cell, and for fill the area', () => {
    const store = editorStoreFor(mapWith([cell(0, 0), cell(1, 0)]))
    const ctx = { store }
    terrainBrush.onPointerMove!(pointerAt(2, 3, { pressed: false }), ctx)
    expect(store.getState().overlay).toEqual([
      { kind: 'cells', cells: [{ x: 2, y: 3 }], style: 'paint' },
    ])
    terrainBrush.onPointerMove!(pointerAt(12, 3, { pressed: false, inside: false }), ctx)
    expect(store.getState().overlay).toEqual([])
    terrainFill.onPointerMove!(pointerAt(0, 0, { pressed: false }), ctx)
    expect(store.getState().overlay).toEqual([
      {
        kind: 'cells',
        cells: expect.arrayContaining([
          { x: 0, y: 0 },
          { x: 1, y: 0 },
        ]) as unknown,
        style: 'paint',
      },
    ])
    terrainFill.onPointerLeave!(ctx)
    expect(store.getState().overlay).toEqual([])
  })

  it('picks the terrain with digits 1–5 and with Alt+click', () => {
    const store = editorStoreFor(mapWith([cell(3, 3, 'water')]))
    const ctx = { store }
    expect(terrainBrush.onKeyDown!(key('4'), ctx)).toBe(true)
    expect(usePaintOptions.getState().terrain).toBe('wall')
    expect(terrainRect.onKeyDown!(key('5'), ctx)).toBe(true)
    expect(usePaintOptions.getState().terrain).toBe('void')
    expect(terrainFill.onKeyDown!(key('6'), ctx)).toBe(false)
    expect(terrainFill.onKeyDown!(key('x'), ctx)).toBe(false)

    drag(terrainBrush, store, [[3, 3]], { alt: true })
    expect(usePaintOptions.getState().terrain).toBe('water')
    expect(store.getState().past).toHaveLength(0)
  })
})

describe('elevation tools', () => {
  it('brush sets the elevation and skips void', () => {
    const store = editorStoreFor(mapWith([cell(0, 0), cell(1, 0, 'wall'), cell(3, 0)]))
    usePaintOptions.getState().setElevation(-1.5)
    drag(elevationBrush, store, [
      [0, 0],
      [3, 0],
    ])
    expect(store.getState().doc.layout.cells).toEqual([
      cell(0, 0, 'floor', -1.5),
      cell(1, 0, 'wall', -1.5),
      cell(3, 0, 'floor', -1.5),
    ])
    expect(store.getState().past).toHaveLength(1)
  })

  it('a stroke over void only does nothing', () => {
    const store = editorStoreFor()
    drag(elevationBrush, store, [
      [0, 0],
      [5, 5],
    ])
    expect(store.getState().past).toHaveLength(0)
  })

  it('rectangle sets the elevation on release', () => {
    const store = editorStoreFor(mapWith([cell(1, 1), cell(2, 2), cell(5, 5)]))
    usePaintOptions.getState().setElevation(3)
    drag(elevationRect, store, [
      [1, 1],
      [2, 2],
    ])
    expect(store.getState().doc.layout.cells).toEqual([
      cell(1, 1, 'floor', 3),
      cell(2, 2, 'floor', 3),
      cell(5, 5),
    ])
  })

  it('labels non-zero elevations while active and keeps them current', () => {
    const store = editorStoreFor(mapWith([cell(0, 0, 'floor', 1.5), cell(1, 0)]))
    const ctx = { store }
    elevationBrush.onActivate!(ctx)
    const labels = () =>
      store
        .getState()
        .overlay.find((o): o is Extract<Overlay, { kind: 'labels' }> => o.kind === 'labels')?.items
    expect(labels()).toEqual([{ x: 0, y: 0, text: '+1,5' }])

    usePaintOptions.getState().setElevation(-3)
    drag(elevationBrush, store, [[1, 0]])
    expect(labels()).toEqual([
      { x: 0, y: 0, text: '+1,5' },
      { x: 1, y: 0, text: '-3' },
    ])
    store.getState().undo()
    expect(labels()).toEqual([{ x: 0, y: 0, text: '+1,5' }])

    elevationBrush.onDeactivate!(ctx)
    expect(store.getState().overlay).toEqual([])
    store.getState().redo()
    expect(store.getState().overlay).toEqual([])
  })

  it('picks the elevation with Alt+click and the quick values with digits', () => {
    const store = editorStoreFor(mapWith([cell(2, 2, 'floor', -1.5)]))
    const ctx = { store }
    drag(elevationRect, store, [[2, 2]], { alt: true })
    expect(usePaintOptions.getState().elevation).toBe(-1.5)
    drag(elevationRect, store, [[7, 7]], { alt: true })
    expect(usePaintOptions.getState().elevation).toBe(-1.5)
    expect(elevationBrush.onKeyDown!(key('5'), ctx)).toBe(true)
    expect(usePaintOptions.getState().elevation).toBe(3)
    expect(store.getState().past).toHaveLength(0)
  })
})
