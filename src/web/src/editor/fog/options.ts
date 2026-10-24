// The "Nebel" tool's choices (knowledge/features/fog-of-war.md, "Preparing"): which shape
// paints, whether it reveals or hides, the cells chosen for an area, and the area the list
// highlights on the canvas. Kept for the app session; not part of the encounter and not undone.
import { create } from 'zustand'
import { EMPTY_CELLS, type CellSet } from '../../fog/cells'

export type FogShape = 'brush' | 'rect' | 'fill'

interface FogOptions {
  shape: FogShape
  /** "Aufdecken" (true) or "Verdecken". */
  reveal: boolean
  /** Painting chooses cells for an area instead of changing the fog. */
  selecting: boolean
  selection: CellSet
  /** The area highlighted on the canvas, by id. */
  highlighted: string | null
  /** New creatures are placed hidden ("verborgen platzieren"). */
  placeHidden: boolean
  setShape(shape: FogShape): void
  setReveal(reveal: boolean): void
  setSelecting(selecting: boolean): void
  setSelection(selection: CellSet): void
  highlight(id: string | null): void
  setPlaceHidden(hidden: boolean): void
}

export const useFogOptions = create<FogOptions>()((set) => ({
  shape: 'brush',
  reveal: true,
  selecting: false,
  selection: EMPTY_CELLS,
  highlighted: null,
  placeHidden: false,
  setShape: (shape) => set({ shape }),
  setReveal: (reveal) => set({ reveal }),
  setSelecting: (selecting) => set({ selecting }),
  setSelection: (selection) => set({ selection }),
  highlight: (highlighted) => set({ highlighted }),
  setPlaceHidden: (placeHidden) => set({ placeHidden }),
}))

/** Back to the defaults, for tests. */
export function resetFogOptions() {
  useFogOptions.setState({
    shape: 'brush',
    reveal: true,
    selecting: false,
    selection: EMPTY_CELLS,
    highlighted: null,
    placeHidden: false,
  })
}
