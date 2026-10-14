import { describe, expect, it } from 'vitest'
import { emptyMap, type EditorMap } from './model'
import { createEditorStore, UNDO_LIMIT } from './store'

const rename = (name: string) => (doc: EditorMap) => ({ ...doc, name })
const addFeature = (id: string) => (doc: EditorMap) => ({
  ...doc,
  layout: {
    ...doc.layout,
    features: [
      ...doc.layout.features,
      { id, kind: 'pillar', label: '', x: 0, y: 0, w: 1, h: 1, elevation: 0, blocksMovement: true },
    ],
  },
})

function store() {
  return createEditorStore(emptyMap('Klamm', 10, 8), 'tool')
}

describe('editor store', () => {
  it('undoes and redoes single changes', () => {
    const s = store()
    s.getState().apply(rename('A'))
    s.getState().apply(rename('B'))
    expect(s.getState().doc.name).toBe('B')

    s.getState().undo()
    expect(s.getState().doc.name).toBe('A')
    s.getState().undo()
    expect(s.getState().doc.name).toBe('Klamm')
    s.getState().undo()
    expect(s.getState().doc.name).toBe('Klamm')

    s.getState().redo()
    s.getState().redo()
    expect(s.getState().doc.name).toBe('B')
  })

  it('drops the redo steps after a new change', () => {
    const s = store()
    s.getState().apply(rename('A'))
    s.getState().undo()
    s.getState().apply(rename('C'))
    s.getState().redo()
    expect(s.getState().doc.name).toBe('C')
    expect(s.getState().future).toHaveLength(0)
  })

  it('ignores a change that returns the same map', () => {
    const s = store()
    s.getState().apply((doc) => doc)
    expect(s.getState().past).toHaveLength(0)
    expect(s.getState().revision).toBe(0)
  })

  it('makes a whole gesture one undo step', () => {
    const s = store()
    s.getState().beginGesture()
    s.getState().updateGesture((doc) => rename(doc.name + '1')(doc))
    s.getState().updateGesture((doc) => rename(doc.name + '2')(doc))
    // From the start of the gesture, like a rectangle being dragged.
    s.getState().updateGesture((_, base) => rename(base.name + '!')(base))
    s.getState().endGesture()

    expect(s.getState().doc.name).toBe('Klamm!')
    expect(s.getState().past).toHaveLength(1)
    s.getState().undo()
    expect(s.getState().doc.name).toBe('Klamm')
  })

  it('leaves no undo step for a gesture that changed nothing', () => {
    const s = store()
    s.getState().beginGesture()
    s.getState().endGesture()
    expect(s.getState().past).toHaveLength(0)
  })

  it('puts the map back when a gesture is cancelled', () => {
    const s = store()
    s.getState().beginGesture()
    s.getState().updateGesture(rename('weg'))
    s.getState().cancelGesture()
    expect(s.getState().doc.name).toBe('Klamm')
    expect(s.getState().past).toHaveLength(0)
    expect(s.getState().gestureBase).toBeNull()
  })

  it('ends a running gesture before undo', () => {
    const s = store()
    s.getState().beginGesture()
    s.getState().updateGesture(rename('A'))
    s.getState().undo()
    expect(s.getState().doc.name).toBe('Klamm')
    s.getState().redo()
    expect(s.getState().doc.name).toBe('A')
  })

  it('raises the revision with every change, undo and redo', () => {
    const s = store()
    s.getState().apply(rename('A'))
    s.getState().undo()
    s.getState().redo()
    expect(s.getState().revision).toBe(3)
  })

  it('keeps at most the undo limit', () => {
    const s = store()
    for (let i = 0; i < UNDO_LIMIT + 10; i++) s.getState().apply(rename(`N${i}`))
    expect(s.getState().past).toHaveLength(UNDO_LIMIT)
  })

  it('drops a selection whose feature is undone', () => {
    const s = store()
    s.getState().apply(addFeature('f1'))
    s.getState().select({ kind: 'feature', id: 'f1' })
    expect(s.getState().selection).toEqual({ kind: 'feature', id: 'f1' })
    s.getState().undo()
    expect(s.getState().selection).toBeNull()
  })

  it('selects only what exists', () => {
    const s = store()
    s.getState().select({ kind: 'entrance', id: 'e9' })
    expect(s.getState().selection).toBeNull()
  })

  it('clears the overlay and any gesture when the tool changes', () => {
    const s = store()
    s.getState().setOverlay([{ kind: 'rect', x: 0, y: 0, w: 2, h: 2, style: 'paint' }])
    s.getState().beginGesture()
    s.getState().updateGesture(rename('A'))
    s.getState().setTool('other')
    expect(s.getState()).toMatchObject({ toolId: 'other', overlay: [], gestureBase: null })
    expect(s.getState().doc.name).toBe('Klamm')
  })
})
