import { beforeEach, describe, expect, it } from 'vitest'
import { drag, editorStoreFor, pointerAt } from '../testing'
import type { EditorStore } from '../store'
import type { EditorTool } from '../tools'
import { entranceTool } from './entranceTool'
import { featureTool } from './featureTool'
import { feature, floor, mapWith, roomCells } from './fixtures'
import { featureTools } from './index'
import { resetPlacementOptions, setEntranceOptions, setFeatureOptions } from './options'
import { selectTool } from './selectTool'

const key = (tool: EditorTool, store: EditorStore, k: string) =>
  tool.onKeyDown?.(new KeyboardEvent('keydown', { key: k }), { store }) ?? false

beforeEach(resetPlacementOptions)

describe('feature tools', () => {
  it('registers select, feature and entrance tools with their shortcuts', () => {
    expect(featureTools.map((t) => [t.id, t.group, t.shortcut])).toEqual([
      ['select', 'features', 'v'],
      ['feature', 'features', 'o'],
      ['entrance', 'entrances', 'e'],
    ])
  })
})

describe('select tool', () => {
  it('selects a feature by clicking it, and clears on empty space', () => {
    const store = editorStoreFor(mapWith([feature('f1', 2, 2, 2, 1)]))
    drag(selectTool, store, [[3, 2]])
    expect(store.getState().selection).toEqual({ kind: 'feature', id: 'f1' })
    drag(selectTool, store, [[6, 6]])
    expect(store.getState().selection).toBeNull()
  })

  it('selects an entrance, and switches between a feature and an entrance on one cell', () => {
    const store = editorStoreFor(
      mapWith(
        [feature('f1', 0, 3, 3, 1, { kind: 'Brücke', blocksMovement: false })],
        [],
        [{ id: 'e1', kind: 'entrance', label: '', cells: [[0, 3]] }],
      ),
    )
    drag(selectTool, store, [[0, 3]])
    expect(store.getState().selection).toEqual({ kind: 'feature', id: 'f1' })
    drag(selectTool, store, [[0, 3]])
    expect(store.getState().selection).toEqual({ kind: 'entrance', id: 'e1' })
    drag(selectTool, store, [[0, 3]])
    expect(store.getState().selection).toEqual({ kind: 'feature', id: 'f1' })
  })

  it('moves a feature by dragging, as one undo step', () => {
    const store = editorStoreFor(mapWith([feature('f1', 1, 1, 2, 2)]))
    const ctx = { store }
    selectTool.onPointerDown!(pointerAt(1, 1), ctx)
    selectTool.onPointerMove!(pointerAt(2, 1), ctx)
    selectTool.onPointerMove!(pointerAt(4, 3), ctx)
    // Only a preview while dragging.
    expect(store.getState().doc.layout.features[0]).toMatchObject({ x: 1, y: 1 })
    expect(store.getState().overlay).toEqual([
      { kind: 'rect', x: 4, y: 3, w: 2, h: 2, style: 'paint' },
    ])
    selectTool.onPointerUp!(pointerAt(4, 3, { pressed: false }), ctx)

    expect(store.getState().doc.layout.features[0]).toMatchObject({ x: 4, y: 3 })
    expect(store.getState().overlay).toEqual([])
    expect(store.getState().past).toHaveLength(1)
    store.getState().undo()
    expect(store.getState().doc.layout.features[0]).toMatchObject({ x: 1, y: 1 })
  })

  it('refuses to move a feature over another or off the grid', () => {
    const store = editorStoreFor(mapWith([feature('f1', 1, 1, 2, 1), feature('f2', 5, 1)]))
    const ctx = { store }
    selectTool.onPointerDown!(pointerAt(1, 1), ctx)
    selectTool.onPointerMove!(pointerAt(4, 1), ctx)
    expect(store.getState().overlay).toEqual([
      { kind: 'rect', x: 4, y: 1, w: 2, h: 1, style: 'invalid' },
    ])
    selectTool.onPointerUp!(pointerAt(4, 1, { pressed: false }), ctx)
    expect(store.getState().doc.layout.features[0]).toMatchObject({ x: 1, y: 1 })

    drag(selectTool, store, [
      [1, 1],
      [9, 1],
    ])
    expect(store.getState().doc.layout.features[0]).toMatchObject({ x: 1, y: 1 })
    expect(store.getState().past).toHaveLength(0)
  })

  it('may move a feature over void and walls', () => {
    const store = editorStoreFor(
      mapWith([feature('f1', 0, 0)], [{ x: 3, y: 3, terrain: 'wall', elevation: 0 }]),
    )
    drag(selectTool, store, [
      [0, 0],
      [3, 3],
    ])
    expect(store.getState().doc.layout.features[0]).toMatchObject({ x: 3, y: 3 })
  })

  it('the entrance tool deletes a clicked entrance with Delete and lets go of it with Escape', () => {
    const store = editorStoreFor(
      mapWith(
        [feature('f1', 2, 2)],
        [floor(0, 1), floor(0, 2)],
        [
          { id: 'e1', kind: 'exit', label: '', cells: [[0, 1]] },
          { id: 'e2', kind: 'entrance', label: '', cells: [[0, 2]] },
        ],
      ),
    )
    expect(key(entranceTool, store, 'Delete')).toBe(false)

    drag(entranceTool, store, [[0, 1]])
    expect(store.getState().selection).toEqual({ kind: 'entrance', id: 'e1' })
    expect(key(entranceTool, store, 'Delete')).toBe(true)
    expect(store.getState().doc.layout.entrances.map((e) => e.id)).toEqual(['e2'])

    drag(entranceTool, store, [[0, 2]])
    expect(key(entranceTool, store, 'Escape')).toBe(true)
    expect(store.getState().selection).toBeNull()
    expect(key(entranceTool, store, 'Escape')).toBe(false)

    // A selected feature isn't the entrance tool's to delete.
    store.getState().select({ kind: 'feature', id: 'f1' })
    expect(key(entranceTool, store, 'Delete')).toBe(false)
    expect(store.getState().doc.layout.features).toHaveLength(1)
  })

  it('deletes the selection with Delete or Backspace, and clears it with Escape', () => {
    const store = editorStoreFor(
      mapWith(
        [feature('f1', 2, 2), feature('f2', 4, 4)],
        [floor(0, 1)],
        [{ id: 'e1', kind: 'exit', label: '', cells: [[0, 1]] }],
      ),
    )
    expect(key(selectTool, store, 'Delete')).toBe(false)

    drag(selectTool, store, [[2, 2]])
    expect(key(selectTool, store, 'Delete')).toBe(true)
    expect(store.getState().doc.layout.features.map((f) => f.id)).toEqual(['f2'])
    expect(store.getState().selection).toBeNull()

    drag(selectTool, store, [[0, 1]])
    expect(key(selectTool, store, 'Backspace')).toBe(true)
    expect(store.getState().doc.layout.entrances).toEqual([])

    drag(selectTool, store, [[4, 4]])
    expect(key(selectTool, store, 'Escape')).toBe(true)
    expect(store.getState().selection).toBeNull()
    expect(key(selectTool, store, 'Escape')).toBe(false)
  })

  it('cancels a drag with Escape', () => {
    const store = editorStoreFor(mapWith([feature('f1', 1, 1)]))
    const ctx = { store }
    selectTool.onPointerDown!(pointerAt(1, 1), ctx)
    selectTool.onPointerMove!(pointerAt(3, 3), ctx)
    expect(key(selectTool, store, 'Escape')).toBe(true)
    expect(store.getState().overlay).toEqual([])
    selectTool.onPointerUp!(pointerAt(3, 3, { pressed: false }), ctx)
    expect(store.getState().doc.layout.features[0]).toMatchObject({ x: 1, y: 1 })
    expect(store.getState().selection).toEqual({ kind: 'feature', id: 'f1' })
  })
})

describe('feature tool', () => {
  it('places a feature with the panel’s options over the dragged rectangle and selects it', () => {
    const store = editorStoreFor(mapWith([feature('f1', 0, 0)]))
    setFeatureOptions({ kind: ' Brücke ', label: 'Hängebrücke', elevation: 2.5 })
    drag(featureTool, store, [
      [6, 4],
      [5, 3],
      [3, 4],
    ])
    const placed = store.getState().doc.layout.features[1]
    expect(placed).toEqual({
      id: 'f2',
      kind: 'Brücke',
      label: 'Hängebrücke',
      x: 3,
      y: 4,
      w: 4,
      h: 1,
      elevation: 2.5,
      blocksMovement: false,
    })
    expect(store.getState().selection).toEqual({ kind: 'feature', id: 'f2' })
    expect(store.getState().past).toHaveLength(1)
    expect(store.getState().overlay).toEqual([])
  })

  it('shows the rectangle while dragging, red where it’s refused', () => {
    const store = editorStoreFor(mapWith([feature('f1', 4, 4)]))
    const ctx = { store }
    featureTool.onPointerDown!(pointerAt(2, 2), ctx)
    featureTool.onPointerMove!(pointerAt(3, 3), ctx)
    expect(store.getState().overlay).toEqual([
      { kind: 'rect', x: 2, y: 2, w: 2, h: 2, style: 'paint' },
    ])
    featureTool.onPointerMove!(pointerAt(4, 4), ctx)
    expect(store.getState().overlay).toEqual([
      { kind: 'rect', x: 2, y: 2, w: 3, h: 3, style: 'invalid' },
    ])
    featureTool.onPointerUp!(pointerAt(4, 4, { pressed: false }), ctx)
    expect(store.getState().doc.layout.features).toHaveLength(1)
  })

  it('refuses rectangles off the grid and features without a kind', () => {
    const store = editorStoreFor(mapWith())
    drag(featureTool, store, [
      [8, 0],
      [10, 0],
    ])
    expect(store.getState().doc.layout.features).toHaveLength(0)

    setFeatureOptions({ kind: '  ' })
    drag(featureTool, store, [[1, 1]])
    expect(store.getState().doc.layout.features).toHaveLength(0)
    expect(store.getState().past).toHaveLength(0)
  })

  it('places features over void and walls', () => {
    const store = editorStoreFor(mapWith([], [{ x: 2, y: 0, terrain: 'wall', elevation: 0 }]))
    setFeatureOptions({ kind: 'Tür', blocksMovement: false })
    drag(featureTool, store, [[2, 0]])
    drag(featureTool, store, [
      [5, 5],
      [6, 6],
    ])
    expect(store.getState().doc.layout.features.map((f) => f.id)).toEqual(['f1', 'f2'])
  })

  it('previews a single cell while hovering', () => {
    const store = editorStoreFor(mapWith())
    featureTool.onPointerMove!(pointerAt(3, 3, { pressed: false }), { store })
    expect(store.getState().overlay).toEqual([
      { kind: 'rect', x: 3, y: 3, w: 1, h: 1, style: 'paint' },
    ])
    featureTool.onPointerLeave!({ store })
    expect(store.getState().overlay).toEqual([])
  })
})

describe('entrance tool', () => {
  it('makes an entrance from the edge cells a drag crosses and selects it', () => {
    const store = editorStoreFor(mapWith([], roomCells()))
    setEntranceOptions({ kind: 'exit', label: ' Waldweg ' })
    drag(entranceTool, store, [
      [0, 2],
      [0, 3],
      [1, 4],
      [0, 5],
    ])
    expect(store.getState().doc.layout.entrances).toEqual([
      {
        id: 'e1',
        kind: 'exit',
        label: 'Waldweg',
        cells: [
          [0, 2],
          [0, 3],
          [0, 5],
        ],
      },
    ])
    expect(store.getState().selection).toEqual({ kind: 'entrance', id: 'e1' })
    expect(store.getState().past).toHaveLength(1)
  })

  it('shows the cells it takes and the ones it refuses', () => {
    const store = editorStoreFor(mapWith([], [floor(0, 0), floor(0, 1), floor(1, 1)]))
    const ctx = { store }
    entranceTool.onPointerDown!(pointerAt(0, 0), ctx)
    entranceTool.onPointerMove!(pointerAt(0, 1), ctx)
    entranceTool.onPointerMove!(pointerAt(1, 1), ctx)
    entranceTool.onPointerMove!(pointerAt(-1, 1, { inside: false }), ctx)
    expect(store.getState().overlay).toEqual([
      {
        kind: 'cells',
        cells: [
          { x: 0, y: 0 },
          { x: 0, y: 1 },
        ],
        style: 'paint',
      },
      // Floor but not on the edge; the cell outside isn't drawn.
      { kind: 'cells', cells: [{ x: 1, y: 1 }], style: 'invalid' },
    ])
    entranceTool.onPointerUp!(pointerAt(-1, 1, { pressed: false }), ctx)
    expect(store.getState().doc.layout.entrances[0]!.cells).toEqual([
      [0, 0],
      [0, 1],
    ])
  })

  it('takes the cells a fast drag skipped', () => {
    const store = editorStoreFor(mapWith([], roomCells()))
    drag(entranceTool, store, [
      [9, 1],
      [9, 5],
    ])
    expect(store.getState().doc.layout.entrances[0]!.cells).toEqual([
      [9, 1],
      [9, 2],
      [9, 3],
      [9, 4],
      [9, 5],
    ])
  })

  it('refuses void, walls, blocking features and cells of other entrances', () => {
    const cells = [
      floor(0, 1),
      floor(0, 2),
      floor(0, 3),
      { ...floor(0, 4), terrain: 'wall' as const },
    ]
    const store = editorStoreFor(
      mapWith([feature('f1', 0, 3)], cells, [
        { id: 'e1', kind: 'entrance', label: '', cells: [[0, 1]] },
      ]),
    )
    drag(entranceTool, store, [
      [0, 0],
      [0, 5],
    ])
    expect(store.getState().doc.layout.entrances.map((e) => e.cells)).toEqual([[[0, 1]], [[0, 2]]])
  })

  it('makes nothing when no cell may be taken', () => {
    const store = editorStoreFor(mapWith([], roomCells()))
    drag(entranceTool, store, [
      [3, 3],
      [4, 4],
    ])
    expect(store.getState().doc.layout.entrances).toEqual([])
    expect(store.getState().past).toHaveLength(0)
  })

  it('selects an existing entrance by clicking one of its cells', () => {
    const store = editorStoreFor(
      mapWith([], roomCells(), [
        {
          id: 'e1',
          kind: 'both',
          label: '',
          cells: [
            [0, 1],
            [0, 2],
          ],
        },
      ]),
    )
    entranceTool.onPointerMove!(pointerAt(0, 2, { pressed: false }), { store })
    expect(store.getState().overlay).toEqual([
      {
        kind: 'cells',
        cells: [
          { x: 0, y: 1 },
          { x: 0, y: 2 },
        ],
        style: 'select',
      },
    ])
    drag(entranceTool, store, [[0, 2]])
    expect(store.getState().selection).toEqual({ kind: 'entrance', id: 'e1' })
    expect(store.getState().doc.layout.entrances).toHaveLength(1)
  })

  it('cancels a drag with Escape', () => {
    const store = editorStoreFor(mapWith([], roomCells()))
    const ctx = { store }
    entranceTool.onPointerDown!(pointerAt(0, 1), ctx)
    expect(key(entranceTool, store, 'Escape')).toBe(true)
    entranceTool.onPointerUp!(pointerAt(0, 1, { pressed: false }), ctx)
    expect(store.getState().doc.layout.entrances).toEqual([])
    expect(key(entranceTool, store, 'Escape')).toBe(false)
  })
})
