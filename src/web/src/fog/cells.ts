// The cell rules of fog of war (knowledge/features/fog-of-war.md): which cells are hidden,
// painting them with a brush, a rectangle or a fill, the areas that group cells, and the
// difference between two fogs. Pure functions on sets of cellKey strings ("x,y"), shared by
// the editor's "Nebel" tool and the DM's board. Fog lists only cells that are part of the
// map (not void), so every painting function takes the playable cells to stay inside.
import type { BoardCell, FogArea, FogDocument, FogView } from '../api/types'
import { buildGrid, cellKey, type GridPoint } from '../board/geometry'
import { lineCells, rectBetween, rectCells } from '../editor/terrain/layout'

/** A set of cells as cellKey strings. */
export type CellSet = ReadonlySet<string>

export const EMPTY_CELLS: CellSet = new Set<string>()

export function parseKey(key: string): GridPoint {
  const [x = 0, y = 0] = key.split(',').map(Number)
  return { x, y }
}

function sorted(cells: Iterable<string>): GridPoint[] {
  return [...cells].map(parseKey).sort((a, b) => a.y - b.y || a.x - b.x)
}

/** The hidden cells of a stored fog document ([x, y] pairs). */
export function hiddenOfDocument(fog: FogDocument | null | undefined): Set<string> {
  return new Set((fog?.hiddenCells ?? []).map(([x = 0, y = 0]) => cellKey(x, y)))
}

/** The hidden cells of the board's fog (the server sends {x, y} objects). */
export function hiddenOfView(fog: Pick<FogView, 'hiddenCells'> | null | undefined): Set<string> {
  return new Set((fog?.hiddenCells ?? []).map((cell) => cellKey(cell.x, cell.y)))
}

/** The cells as the server's {x, y} objects, in reading order. */
export function boardCells(cells: Iterable<string>): BoardCell[] {
  return sorted(cells).map(({ x, y }) => ({ x, y }))
}

/** The stored fog document: hidden cells in reading order, areas as they are. */
export function documentOf(hidden: CellSet, areas: readonly FogArea[]): FogDocument {
  return { hiddenCells: sorted(hidden).map(({ x, y }) => [x, y]), areas: [...areas] }
}

/** Every cell that is part of the map: not void, or covered by a feature (a bridge over a gap). */
export function playableCells(map: Parameters<typeof buildGrid>[0]): Set<string> {
  const grid = buildGrid(map)
  const cells = new Set<string>()
  for (let y = 0; y < map.height; y++)
    for (let x = 0; x < map.width; x++)
      if (grid.terrain(x, y) !== 'void' || grid.featureAt(x, y)) cells.add(cellKey(x, y))
  return cells
}

// ---- Painting ----------------------------------------------------------------------------

function keep(cells: readonly GridPoint[], playable: CellSet): Set<string> {
  const kept = new Set<string>()
  for (const { x, y } of cells) {
    const key = cellKey(x, y)
    if (playable.has(key)) kept.add(key)
  }
  return kept
}

/** The cells a brush stroke covers between two pointer positions, on the map. */
export function brushStroke(from: GridPoint, to: GridPoint, playable: CellSet): Set<string> {
  return keep(lineCells(from, to), playable)
}

/** The cells of the rectangle between two corners, on the map. */
export function rectangle(
  map: { width: number; height: number },
  a: GridPoint,
  b: GridPoint,
  playable: CellSet,
): Set<string> {
  const rect = rectBetween(map, a, b)
  return rect ? keep(rectCells(rect), playable) : new Set()
}

/**
 * The connected cells (four neighbours) that are hidden like the start cell, on the map:
 * a click on fog takes the whole connected fog, a click on a revealed cell the whole open
 * space around it.
 */
export function fillFrom(start: GridPoint, hidden: CellSet, playable: CellSet): Set<string> {
  const startKey = cellKey(start.x, start.y)
  if (!playable.has(startKey)) return new Set()
  const target = hidden.has(startKey)
  const area = new Set([startKey])
  const stack = [start]
  while (stack.length > 0) {
    const { x, y } = stack.pop()!
    for (const next of [
      { x: x + 1, y },
      { x: x - 1, y },
      { x, y: y + 1 },
      { x, y: y - 1 },
    ]) {
      const key = cellKey(next.x, next.y)
      if (area.has(key) || !playable.has(key) || hidden.has(key) !== target) continue
      area.add(key)
      stack.push(next)
    }
  }
  return area
}

/** The hidden cells after revealing (`reveal`) or hiding `cells`; the same set when nothing changes. */
export function paintFog(hidden: CellSet, cells: CellSet, reveal: boolean): CellSet {
  const next = new Set(hidden)
  for (const key of cells) {
    if (reveal) next.delete(key)
    else next.add(key)
  }
  return next.size === hidden.size && [...next].every((key) => hidden.has(key)) ? hidden : next
}

/** What painting `cells` would really change: hidden cells to reveal, or revealed ones to hide. */
export function effectiveCells(hidden: CellSet, cells: CellSet, reveal: boolean): Set<string> {
  const changed = new Set<string>()
  for (const key of cells) if (hidden.has(key) === reveal) changed.add(key)
  return changed
}

// ---- Differences ---------------------------------------------------------------------------

export interface FogDiff {
  /** Hidden before, revealed now. */
  revealed: string[]
  /** Revealed before, hidden now. */
  hidden: string[]
}

export function diffFog(before: CellSet, after: CellSet): FogDiff {
  return {
    revealed: [...before].filter((key) => !after.has(key)),
    hidden: [...after].filter((key) => !before.has(key)),
  }
}

// ---- Areas ---------------------------------------------------------------------------------

/** A free id "a1", "a2" … */
export function nextAreaId(areas: readonly FogArea[]): string {
  const used = new Set(areas.map((area) => area.id))
  for (let n = areas.length + 1; ; n++) if (!used.has(`a${n}`)) return `a${n}`
}

export const AREA_NAME_MAX = 40

/** An area's name: trimmed, 1 to 40 characters; null for anything else. */
export function cleanAreaName(name: string): string | null {
  const trimmed = name.trim()
  const length = Array.from(trimmed).length
  return length >= 1 && length <= AREA_NAME_MAX ? trimmed : null
}

const cellPairs = (cells: CellSet): number[][] => sorted(cells).map(({ x, y }) => [x, y])

/** A new area of the cells, cut to the map. Unchanged for no cells or a bad name. */
export function addArea(
  areas: readonly FogArea[],
  name: string,
  cells: CellSet,
  playable: CellSet,
): readonly FogArea[] {
  const clean = cleanAreaName(name)
  const inside = new Set([...cells].filter((key) => playable.has(key)))
  if (clean === null || inside.size === 0) return areas
  return [...areas, { id: nextAreaId(areas), name: clean, cells: cellPairs(inside) }]
}

export function renameArea(
  areas: readonly FogArea[],
  id: string,
  name: string,
): readonly FogArea[] {
  const clean = cleanAreaName(name)
  if (clean === null || areas.find((area) => area.id === id)?.name === clean) return areas
  return areas.map((area) => (area.id === id ? { ...area, name: clean } : area))
}

/** Redraws an area: its cells become the given ones, cut to the map. */
export function redrawArea(
  areas: readonly FogArea[],
  id: string,
  cells: CellSet,
  playable: CellSet,
): readonly FogArea[] {
  const inside = new Set([...cells].filter((key) => playable.has(key)))
  if (inside.size === 0 || !areas.some((area) => area.id === id)) return areas
  return areas.map((area) => (area.id === id ? { ...area, cells: cellPairs(inside) } : area))
}

export function deleteArea(areas: readonly FogArea[], id: string): readonly FogArea[] {
  return areas.some((area) => area.id === id) ? areas.filter((area) => area.id !== id) : areas
}

export function areaCells(area: FogArea): Set<string> {
  return new Set(area.cells.map(([x = 0, y = 0]) => cellKey(x, y)))
}

/** The areas that contain the cell, in the order they were drawn. */
export function areasAt(areas: readonly FogArea[], cell: GridPoint): FogArea[] {
  const key = cellKey(cell.x, cell.y)
  return areas.filter((area) => area.cells.some(([x = 0, y = 0]) => cellKey(x, y) === key))
}

/** Drops cells outside the map from the fog and its areas (the map is fixed in encounter mode). */
export function trimToMap(fog: FogDocument, playable: CellSet): FogDocument {
  const hiddenCells = fog.hiddenCells.filter(([x = 0, y = 0]) => playable.has(cellKey(x, y)))
  const areas = fog.areas.map((area) => ({
    ...area,
    cells: area.cells.filter(([x = 0, y = 0]) => playable.has(cellKey(x, y))),
  }))
  const same =
    hiddenCells.length === fog.hiddenCells.length &&
    areas.every((area, i) => area.cells.length === fog.areas[i]!.cells.length)
  return same ? fog : { hiddenCells, areas }
}
