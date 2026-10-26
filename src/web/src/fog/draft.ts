// The DM's fog change at the table, before it is sent (knowledge/features/fog-of-war.md,
// "During the fight"): taps choose cells with the tools "Bereich", "Pinsel" or "Rechteck",
// the cells are outlined as a preview, and a bar asks "12 Felder aufdecken?". Nothing reaches
// the players until the DM confirms. Pure state functions; the board keeps the state.
import type { FogArea } from '../api/types'
import type { GridPoint } from '../board/geometry'
import { cellKey } from '../board/geometry'
import { areaCells, areasAt, effectiveCells, rectangle, type CellSet } from './cells'

export type FogTool = 'area' | 'brush' | 'rect'

export interface FogDraft {
  tool: FogTool
  /** Reveal ("Aufdecken") or hide ("Verdecken") the chosen cells. */
  reveal: boolean
  /** The chosen cells: the preview. */
  cells: CellSet
  /** Rectangle: the first corner, waiting for the second tap. */
  corner: GridPoint | null
  /** Area: a tapped cell lying in several areas; the DM picks one. */
  choose: { cell: GridPoint; areas: FogArea[] } | null
}

export const NEW_DRAFT: FogDraft = {
  tool: 'brush',
  reveal: true,
  cells: new Set<string>(),
  corner: null,
  choose: null,
}

/** What a tap needs to know about the map and the fog. */
export interface FogMap {
  width: number
  height: number
  playable: CellSet
  areas: readonly FogArea[]
}

/** The same tool and direction with nothing chosen. */
export function cleared(draft: FogDraft): FogDraft {
  return { ...draft, cells: NEW_DRAFT.cells, corner: null, choose: null }
}

export function pickTool(draft: FogDraft, tool: FogTool): FogDraft {
  return draft.tool === tool ? draft : { ...cleared(draft), tool }
}

/** Switching between "Aufdecken" and "Verdecken" keeps the chosen cells. */
export function pickDirection(draft: FogDraft, reveal: boolean): FogDraft {
  return draft.reveal === reveal ? draft : { ...draft, reveal }
}

/** A tap on a cell of the map. */
export function tapFog(draft: FogDraft, cell: GridPoint, map: FogMap): FogDraft {
  const key = cellKey(cell.x, cell.y)
  if (!map.playable.has(key)) return draft
  switch (draft.tool) {
    case 'brush': {
      const cells = new Set(draft.cells)
      if (!cells.delete(key)) cells.add(key)
      return { ...draft, cells, choose: null }
    }
    case 'rect': {
      if (!draft.corner) return { ...draft, corner: cell, cells: new Set([key]), choose: null }
      return {
        ...draft,
        corner: null,
        cells: rectangle(map, draft.corner, cell, map.playable),
        choose: null,
      }
    }
    case 'area': {
      const areas = areasAt(map.areas, cell)
      if (areas.length === 0) return { ...cleared(draft) }
      if (areas.length === 1) return { ...draft, cells: areaCells(areas[0]!), choose: null }
      return { ...draft, cells: new Set([key]), choose: { cell, areas } }
    }
  }
}

/** One of the areas the tapped cell lies in. */
export function chooseArea(draft: FogDraft, area: FogArea): FogDraft {
  return { ...draft, cells: areaCells(area), choose: null }
}

/** The cells that really change if the DM confirms. */
export function changingCells(draft: FogDraft, hidden: CellSet): Set<string> {
  return effectiveCells(hidden, draft.cells, draft.reveal)
}

/** The bar shows once something is chosen. */
export function barOpen(draft: FogDraft): boolean {
  return draft.cells.size > 0 && draft.choose === null
}
