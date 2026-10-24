// Fog in the encounter editor (knowledge/features/fog-of-war.md, "Preparing"): every change
// is a function from one EncounterDoc to the next, like the creature changes next to it.
// Fog belongs to the encounter, not to the reusable map. Cells outside the map or void are
// never listed, so every function takes the map's playable cells.
import type { FogArea, FogDocument, MapLayout } from '../../api/types'
import {
  addArea,
  deleteArea,
  documentOf,
  hiddenOfDocument,
  paintFog,
  redrawArea,
  renameArea,
  type CellSet,
} from '../../fog/cells'
import type { EncounterDoc } from '../encounter/tokens'

const NO_AREAS: readonly FogArea[] = []

function withFog(doc: EncounterDoc, fog: FogDocument | null): EncounterDoc {
  return { ...doc, fog }
}

/** Turns fog on: the whole map is hidden. Unchanged when it is already on. */
export function turnFogOn(doc: EncounterDoc, playable: CellSet): EncounterDoc {
  return doc.fog ? doc : withFog(doc, documentOf(new Set(playable), NO_AREAS))
}

/** Turns fog off: everything is visible again, and the areas go with it. */
export function turnFogOff(doc: EncounterDoc): EncounterDoc {
  return doc.fog ? withFog(doc, null) : doc
}

/** Reveals ("Aufdecken") or hides ("Verdecken") cells; the same doc when nothing changes. */
export function paintDocFog(doc: EncounterDoc, cells: CellSet, reveal: boolean): EncounterDoc {
  if (!doc.fog) return doc
  const hidden = hiddenOfDocument(doc.fog)
  const next = paintFog(hidden, cells, reveal)
  return next === hidden ? doc : withFog(doc, documentOf(next, doc.fog.areas))
}

/** "Alles aufdecken": no cell is hidden, the areas stay. */
export function revealAll(doc: EncounterDoc): EncounterDoc {
  if (!doc.fog || doc.fog.hiddenCells.length === 0) return doc
  return withFog(doc, { ...doc.fog, hiddenCells: [] })
}

/** "Alles verdecken": the whole map is hidden again, the areas stay. */
export function hideAll(doc: EncounterDoc, playable: CellSet): EncounterDoc {
  if (!doc.fog) return doc
  const all = documentOf(new Set(playable), doc.fog.areas)
  return all.hiddenCells.length === doc.fog.hiddenCells.length ? doc : withFog(doc, all)
}

/** Changes the areas. */
function withAreas(doc: EncounterDoc, areas: readonly FogArea[]): EncounterDoc {
  if (!doc.fog || areas === doc.fog.areas) return doc
  return withFog(doc, { ...doc.fog, areas: [...areas] })
}

/** "Bereich anlegen": the chosen cells become a named area. */
export function createArea(
  doc: EncounterDoc,
  name: string,
  cells: CellSet,
  playable: CellSet,
): EncounterDoc {
  return doc.fog ? withAreas(doc, addArea(doc.fog.areas, name, cells, playable)) : doc
}

export function renameDocArea(doc: EncounterDoc, id: string, name: string): EncounterDoc {
  return doc.fog ? withAreas(doc, renameArea(doc.fog.areas, id, name)) : doc
}

export function redrawDocArea(
  doc: EncounterDoc,
  id: string,
  cells: CellSet,
  playable: CellSet,
): EncounterDoc {
  return doc.fog ? withAreas(doc, redrawArea(doc.fog.areas, id, cells, playable)) : doc
}

export function deleteDocArea(doc: EncounterDoc, id: string): EncounterDoc {
  return doc.fog ? withAreas(doc, deleteArea(doc.fog.areas, id)) : doc
}

/**
 * The entrances that lie entirely in the fog (the Prüfung note): characters usually start
 * there. An entrance with no cells isn't flagged.
 */
export function entrancesInFog(layout: MapLayout, fog: FogDocument | null | undefined) {
  if (!fog) return []
  const hidden = hiddenOfDocument(fog)
  return layout.entrances.filter(
    (entrance) =>
      entrance.cells.length > 0 &&
      entrance.cells.every(([x = 0, y = 0]) => hidden.has(`${x},${y}`)),
  )
}
