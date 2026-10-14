// The encounter editor's state: the encounter being edited with undo and redo, and the
// selected token. A sibling of the map editor's store (editor/store.ts) with the same
// idea (every change is a pure function from one document to the next, whole snapshots
// for undo); the active tool, the overlay and the map stay in the map store, which
// encounter mode keeps unchanged. Changes here are single steps: the panel's fields
// commit on blur, so there are no gestures.
import { createContext, useContext, useSyncExternalStore } from 'react'
import { createStore, useStore, type StoreApi } from 'zustand'
import { UNDO_LIMIT } from '../store'
import type { EncounterDoc } from './tokens'

/** What never changes while the encounter is open. */
export interface EncounterMeta {
  campaignId: string
  mapId: string
  encounterId: string
  /** Active and ended encounters (and ones whose map is gone) can't be edited. */
  readOnly: boolean
}

export interface EncounterState {
  doc: EncounterDoc
  past: EncounterDoc[]
  future: EncounterDoc[]
  /** Rises with every change of `doc`, undo and redo included; autosave watches it. */
  revision: number
  /** The document last handed to a successful write; the start button waits for it. */
  savedDoc: EncounterDoc
  selectedId: string | null
  meta: EncounterMeta

  /** One undo step. A change that returns the same document does nothing. */
  apply(change: (doc: EncounterDoc) => EncounterDoc): void
  undo(): void
  redo(): void
  select(id: string | null): void
}

export type EncounterStore = StoreApi<EncounterState>

export function createEncounterStore(doc: EncounterDoc, meta: EncounterMeta): EncounterStore {
  /** Keeps the selection only while the token exists. */
  const validSelection = (id: string | null, doc: EncounterDoc) =>
    id !== null && doc.tokens.some((token) => token.id === id) ? id : null
  const push = (past: EncounterDoc[], doc: EncounterDoc) => [...past, doc].slice(-UNDO_LIMIT)

  return createStore<EncounterState>()((set, get) => ({
    doc,
    past: [],
    future: [],
    revision: 0,
    savedDoc: doc,
    selectedId: null,
    meta,

    apply(change) {
      if (get().meta.readOnly) return
      const { doc, past, selectedId, revision } = get()
      const next = change(doc)
      if (next === doc) return
      set({
        doc: next,
        past: push(past, doc),
        future: [],
        revision: revision + 1,
        selectedId: validSelection(selectedId, next),
      })
    },

    undo() {
      const { past, future, doc, selectedId, revision } = get()
      const previous = past.at(-1)
      if (!previous) return
      set({
        doc: previous,
        past: past.slice(0, -1),
        future: [doc, ...future],
        revision: revision + 1,
        selectedId: validSelection(selectedId, previous),
      })
    },

    redo() {
      const { past, future, doc, selectedId, revision } = get()
      const next = future[0]
      if (!next) return
      set({
        doc: next,
        past: push(past, doc),
        future: future.slice(1),
        revision: revision + 1,
        selectedId: validSelection(selectedId, next),
      })
    },

    select(id) {
      set({ selectedId: validSelection(id, get().doc) })
    },
  }))
}

export const EncounterStoreContext = createContext<EncounterStore | null>(null)

/** The encounter store of the surrounding editor page; throws outside encounter mode. */
export function useEncounterStore(): EncounterStore {
  const store = useContext(EncounterStoreContext)
  if (!store) throw new Error('useEncounterStore outside <EncounterStoreContext>')
  return store
}

/** The encounter store when the editor is in encounter mode, else null. */
export function useOptionalEncounterStore(): EncounterStore | null {
  return useContext(EncounterStoreContext)
}

/** A slice of the encounter state; re-renders only when the slice changes. */
export function useEncounter<T>(selector: (state: EncounterState) => T): T {
  return useStore(useEncounterStore(), selector)
}

/** Like useEncounter for a store that may be missing (map mode); then `fallback`. */
export function useOptionalEncounter<T>(
  store: EncounterStore | null | undefined,
  selector: (state: EncounterState) => T,
  fallback: T,
): T {
  return useSyncExternalStore(
    (onChange) => (store ? store.subscribe(onChange) : () => {}),
    () => (store ? selector(store.getState()) : fallback),
  )
}

/** Where the editor is open: the campaign and map, provided by the editor page. */
export interface EditorTarget {
  campaignId: string
  mapId: string
}

export const EditorTargetContext = createContext<EditorTarget | null>(null)

export function useEditorTarget(): EditorTarget {
  const target = useContext(EditorTargetContext)
  if (!target) throw new Error('useEditorTarget outside <EditorTargetContext>')
  return target
}
