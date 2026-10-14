// The editor's state (knowledge/implementation-plan.md, stage 5): the map being edited,
// undo and redo, the active tool, the selection and what tools draw over the map.
//
// Every change is a pure function from one EditorMap to the next. `apply` makes one
// undo step; a drag (a brush stroke, a rectangle) is a gesture: `beginGesture`, any
// number of `updateGesture`, then `endGesture`, which makes the whole drag one undo
// step. Layouts are small (at most 40 × 40 cells), so undo keeps whole snapshots.
import { createContext, useContext } from 'react'
import { createStore, useStore, type StoreApi } from 'zustand'
import type { GridPoint } from '../board/geometry'
import type { EditorMap } from './model'

/** What is selected on the map, for the property panel and Delete. */
export type Selection = { kind: 'feature'; id: string } | { kind: 'entrance'; id: string }

/** How an overlay is drawn: a brush preview, an eraser, a selection, a rejected spot. */
export type OverlayStyle = 'paint' | 'erase' | 'select' | 'invalid'

/** Shapes a tool draws over the map, in cells. The canvas draws them; tools only set them. */
export type Overlay =
  | { kind: 'cells'; cells: readonly GridPoint[]; style: OverlayStyle }
  | { kind: 'rect'; x: number; y: number; w: number; h: number; style: OverlayStyle }
  /** Short texts centred in cells, e.g. elevations; drawn only when cells are large enough. */
  | { kind: 'labels'; items: readonly { x: number; y: number; text: string }[] }

/** How many steps undo goes back. */
export const UNDO_LIMIT = 200

export interface EditorState {
  doc: EditorMap
  past: EditorMap[]
  future: EditorMap[]
  /** The map when the running gesture began; null outside gestures. */
  gestureBase: EditorMap | null
  /** Rises with every change of `doc`, undo and redo included; autosave watches it. */
  revision: number
  toolId: string
  selection: Selection | null
  overlay: readonly Overlay[]

  /** One undo step. A change that returns the same map does nothing. */
  apply(change: (doc: EditorMap) => EditorMap): void
  beginGesture(): void
  /** Changes the map during a gesture: from where the gesture began, or from now. */
  updateGesture(change: (current: EditorMap, base: EditorMap) => EditorMap): void
  /** Ends the gesture as one undo step (none if nothing changed). */
  endGesture(): void
  /** Ends the gesture and puts the map back as it was before it. */
  cancelGesture(): void
  undo(): void
  redo(): void
  setTool(toolId: string): void
  select(selection: Selection | null): void
  setOverlay(overlay: readonly Overlay[]): void
}

export type EditorStore = StoreApi<EditorState>

export function createEditorStore(doc: EditorMap, toolId: string): EditorStore {
  return createStore<EditorState>()((set, get) => {
    /** Keeps the selection only while what it points to exists. */
    const validSelection = (selection: Selection | null, map: EditorMap) => {
      if (!selection) return null
      const list = selection.kind === 'feature' ? map.layout.features : map.layout.entrances
      return list.some((item) => item.id === selection.id) ? selection : null
    }
    const push = (past: EditorMap[], doc: EditorMap) => [...past, doc].slice(-UNDO_LIMIT)

    return {
      doc,
      past: [],
      future: [],
      gestureBase: null,
      revision: 0,
      toolId,
      selection: null,
      overlay: [],

      apply(change) {
        const state = get()
        if (state.gestureBase) state.endGesture()
        const { doc, past, selection, revision } = get()
        const next = change(doc)
        if (next === doc) return
        set({
          doc: next,
          past: push(past, doc),
          future: [],
          revision: revision + 1,
          selection: validSelection(selection, next),
        })
      },

      beginGesture() {
        const { gestureBase, doc } = get()
        if (!gestureBase) set({ gestureBase: doc })
      },

      updateGesture(change) {
        const { gestureBase, doc, revision } = get()
        if (!gestureBase) return
        const next = change(doc, gestureBase)
        if (next !== doc) set({ doc: next, revision: revision + 1 })
      },

      endGesture() {
        const { gestureBase, doc, past, selection } = get()
        if (!gestureBase) return
        if (doc === gestureBase) {
          set({ gestureBase: null })
          return
        }
        set({
          gestureBase: null,
          past: push(past, gestureBase),
          future: [],
          selection: validSelection(selection, doc),
        })
      },

      cancelGesture() {
        const { gestureBase, doc, revision } = get()
        if (!gestureBase) return
        set({
          gestureBase: null,
          doc: gestureBase,
          overlay: [],
          revision: doc === gestureBase ? revision : revision + 1,
        })
      },

      undo() {
        get().endGesture()
        const { past, future, doc, selection, revision } = get()
        const previous = past.at(-1)
        if (!previous) return
        set({
          doc: previous,
          past: past.slice(0, -1),
          future: [doc, ...future],
          revision: revision + 1,
          selection: validSelection(selection, previous),
        })
      },

      redo() {
        get().endGesture()
        const { past, future, doc, selection, revision } = get()
        const next = future[0]
        if (!next) return
        set({
          doc: next,
          past: push(past, doc),
          future: future.slice(1),
          revision: revision + 1,
          selection: validSelection(selection, next),
        })
      },

      setTool(toolId) {
        get().cancelGesture()
        set({ toolId, overlay: [] })
      },

      select(selection) {
        set({ selection: validSelection(selection, get().doc) })
      },

      setOverlay(overlay) {
        set({ overlay })
      },
    }
  })
}

export const EditorStoreContext = createContext<EditorStore | null>(null)

/** The editor store of the surrounding editor page. */
export function useEditorStore(): EditorStore {
  const store = useContext(EditorStoreContext)
  if (!store) throw new Error('useEditorStore outside <EditorStoreContext>')
  return store
}

/** A slice of the editor state; re-renders only when the slice changes. */
export function useEditor<T>(selector: (state: EditorState) => T): T {
  return useStore(useEditorStore(), selector)
}
