// The layout rules of a battle map (knowledge/domain/battle-map.md, "Layout document"),
// checked in the editor before a map leaves the browser. Stage 6 makes these the shared
// checks with the server (knowledge/decisions/offline-prep-pwa.md, "Rejections"): the
// cases in validation.cases.json drive both the Vitest tests and, later, a C# test.
//
// Unlike the server's import, which stops at the first broken rule, this reports every
// problem, so the editor can list them all and lead the DM to each one.
import type { LayoutEntrance, Terrain } from '../api/types'
import { buildGrid, type GridPoint } from '../board/geometry'
import { limits } from '../lib/limits'
import { LAYOUT_SCHEMA_VERSION, MIN_MAP_SIZE, type EditorMap } from './model'

export type LayoutProblemCode =
  /** Width or height isn't a whole number from 1 to limits.mapSize. */
  | 'mapSizeInvalid'
  /** The layout's schemaVersion isn't the one this app writes. */
  | 'layoutVersionUnsupported'
  /** The map has no name (blank after trimming). */
  | 'nameMissing'
  /** A text is longer than its limit after trimming; `field` names it. */
  | 'textTooLong'
  /** A listed cell isn't a whole-numbered cell inside the grid. */
  | 'cellOutside'
  /** A cell is listed more than once; reported on every repeat. */
  | 'cellDuplicate'
  | 'terrainInvalid'
  /** A cell's or a feature's elevation isn't a number below limits.elevation either way. */
  | 'elevationInvalid'
  /** A feature or entrance has an empty id. */
  | 'idMissing'
  /** A feature id is used before; reported on every repeat. */
  | 'featureIdDuplicate'
  /** A feature's kind is blank. */
  | 'featureKindMissing'
  /** A feature's width or height isn't a whole number of at least 1. */
  | 'featureSizeInvalid'
  /** Part of a feature's footprint lies outside the grid. */
  | 'featureOutside'
  /** Two features overlap; reported on the later one, with the earlier as `otherId`. */
  | 'featureOverlap'
  /** An entrance id is used before; reported on every repeat. */
  | 'entranceIdDuplicate'
  /** Not "entrance", "exit" or "both". */
  | 'entranceKindInvalid'
  /** An entrance without cells. */
  | 'entranceEmpty'
  /** An entrance cell isn't a whole-numbered cell inside the grid. */
  | 'entranceCellOutside'
  /** An entrance cell inside the grid but not on its outer edge. */
  | 'entranceCellNotOnEdge'
  /** An entrance cell no token may stand on: void, wall or under a blocking feature. */
  | 'entranceCellNotWalkable'
  /** An entrance lists the same cell twice; reported on the repeat. */
  | 'entranceCellDuplicate'
  /** A cell already belongs to an earlier entrance (`otherId`). */
  | 'entranceCellShared'

/** Which text is too long, or which id is missing. */
export type LayoutTextField = 'name' | 'scene' | 'vibe' | 'lighting' | 'id' | 'kind' | 'label'

/** Where a problem lies: the map itself, a listed cell, a feature or an entrance. */
export type LayoutItem =
  | { kind: 'map' }
  /** `index` in layout.cells. */
  | { kind: 'cell'; index: number; x: number; y: number }
  /** `index` in layout.features. */
  | { kind: 'feature'; index: number; id: string }
  /** `index` in layout.entrances. */
  | { kind: 'entrance'; index: number; id: string }

export interface LayoutProblem {
  code: LayoutProblemCode
  item: LayoutItem
  /** The text that is too long or the id that is missing. */
  field?: LayoutTextField
  /** The entrance cell the problem is about. */
  cell?: GridPoint
  /** The other feature or entrance in an overlap or a shared cell. */
  otherId?: string
}

const TERRAINS: readonly Terrain[] = ['void', 'floor', 'difficult', 'water', 'wall']
const ENTRANCE_KINDS: readonly LayoutEntrance['kind'][] = ['entrance', 'exit', 'both']

/** A footprint in cells. */
export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/** The whole rectangle lies inside a grid of this size. */
export function rectInside(rect: Rect, width: number, height: number): boolean {
  return (
    rect.w >= 1 &&
    rect.h >= 1 &&
    rect.x >= 0 &&
    rect.y >= 0 &&
    rect.x + rect.w <= width &&
    rect.y + rect.h <= height
  )
}

/** The two rectangles share at least one cell. */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
}

/** The cell lies inside the grid and on its outer edge. */
export function isEdgeCell(x: number, y: number, width: number, height: number): boolean {
  return (
    x >= 0 &&
    y >= 0 &&
    x < width &&
    y < height &&
    (x === 0 || y === 0 || x === width - 1 || y === height - 1)
  )
}

/** A valid map side: a whole number of cells from 1 to limits.mapSize. */
export function validMapSide(n: number): boolean {
  return Number.isInteger(n) && n >= MIN_MAP_SIZE && n <= limits.mapSize
}

/** An elevation the server accepts: a number below limits.elevation either way. */
export function validElevation(meters: number): boolean {
  return Number.isFinite(meters) && Math.abs(meters) < limits.elevation
}

const isWhole = (n: unknown): n is number => Number.isInteger(n)
const tooLong = (text: string, max: number) => text.trim().length > max

/**
 * Every rule the map breaks, in a stable order: the map, then cells, features and
 * entrances in list order. While the map size itself is invalid, whether cells,
 * features and entrances lie inside the grid, on its edge or on walkable cells isn't
 * checked; everything else is.
 */
export function checkLayout(map: EditorMap): LayoutProblem[] {
  const problems: LayoutProblem[] = []
  const { width, height, layout } = map
  const sizeValid = validMapSide(width) && validMapSide(height)
  const inside = (x: unknown, y: unknown): boolean =>
    isWhole(x) && isWhole(y) && x >= 0 && y >= 0 && x < width && y < height

  // The map.
  const onMap = { kind: 'map' } as const
  if (!sizeValid) problems.push({ code: 'mapSizeInvalid', item: onMap })
  if (layout.schemaVersion !== LAYOUT_SCHEMA_VERSION)
    problems.push({ code: 'layoutVersionUnsupported', item: onMap })
  if (map.name.trim().length === 0) problems.push({ code: 'nameMissing', item: onMap })
  if (tooLong(map.name, limits.mapName))
    problems.push({ code: 'textTooLong', item: onMap, field: 'name' })
  for (const field of ['scene', 'vibe', 'lighting'] as const)
    if (tooLong(map[field], limits.mapDescription))
      problems.push({ code: 'textTooLong', item: onMap, field })

  // Cells.
  const listed = new Set<string>()
  layout.cells.forEach((cell, index) => {
    const item = { kind: 'cell', index, x: cell.x, y: cell.y } as const
    if (sizeValid ? !inside(cell.x, cell.y) : !isWhole(cell.x) || !isWhole(cell.y))
      problems.push({ code: 'cellOutside', item })
    const key = `${cell.x},${cell.y}`
    if (listed.has(key)) problems.push({ code: 'cellDuplicate', item })
    listed.add(key)
    if (!TERRAINS.includes(cell.terrain)) problems.push({ code: 'terrainInvalid', item })
    if (!validElevation(cell.elevation)) problems.push({ code: 'elevationInvalid', item })
  })

  // Features.
  const featureIds = new Set<string>()
  const footprints: { id: string; rect: Rect }[] = []
  layout.features.forEach((feature, index) => {
    const item = { kind: 'feature', index, id: feature.id } as const
    if (feature.id.trim().length === 0) problems.push({ code: 'idMissing', item, field: 'id' })
    else if (featureIds.has(feature.id)) problems.push({ code: 'featureIdDuplicate', item })
    featureIds.add(feature.id)
    if (feature.kind.trim().length === 0) problems.push({ code: 'featureKindMissing', item })
    for (const field of ['id', 'kind', 'label'] as const)
      if (tooLong(feature[field], limits.layoutText))
        problems.push({ code: 'textTooLong', item, field })
    if (!validElevation(feature.elevation)) problems.push({ code: 'elevationInvalid', item })

    const rect = { x: feature.x, y: feature.y, w: feature.w, h: feature.h }
    if (!isWhole(rect.w) || !isWhole(rect.h) || rect.w < 1 || rect.h < 1) {
      problems.push({ code: 'featureSizeInvalid', item })
      return
    }
    if (!isWhole(rect.x) || !isWhole(rect.y) || (sizeValid && !rectInside(rect, width, height)))
      problems.push({ code: 'featureOutside', item })
    for (const other of footprints)
      if (rectsOverlap(rect, other.rect))
        problems.push({ code: 'featureOverlap', item, otherId: other.id })
    footprints.push({ id: feature.id, rect })
  })

  // Entrances.
  const grid = sizeValid ? buildGrid(map) : null
  const entranceIds = new Set<string>()
  const owner = new Map<string, string>()
  layout.entrances.forEach((entrance, index) => {
    const item = { kind: 'entrance', index, id: entrance.id } as const
    if (entrance.id.trim().length === 0) problems.push({ code: 'idMissing', item, field: 'id' })
    else if (entranceIds.has(entrance.id)) problems.push({ code: 'entranceIdDuplicate', item })
    entranceIds.add(entrance.id)
    if (!ENTRANCE_KINDS.includes(entrance.kind))
      problems.push({ code: 'entranceKindInvalid', item })
    for (const field of ['id', 'label'] as const)
      if (tooLong(entrance[field], limits.layoutText))
        problems.push({ code: 'textTooLong', item, field })
    if (entrance.cells.length === 0) problems.push({ code: 'entranceEmpty', item })

    const own = new Set<string>()
    for (const pair of entrance.cells) {
      const [x, y] = pair
      const wellFormed = pair.length === 2 && isWhole(x) && isWhole(y)
      const cell = { x: x ?? NaN, y: y ?? NaN }
      if (!wellFormed || (grid && !inside(x, y))) {
        problems.push({ code: 'entranceCellOutside', item, cell })
        continue
      }
      if (grid) {
        if (!isEdgeCell(x, y, width, height))
          problems.push({ code: 'entranceCellNotOnEdge', item, cell })
        if (!grid.walkable(x, y)) problems.push({ code: 'entranceCellNotWalkable', item, cell })
      }
      const key = `${x},${y}`
      if (own.has(key)) {
        problems.push({ code: 'entranceCellDuplicate', item, cell })
        continue
      }
      own.add(key)
      const earlier = owner.get(key)
      if (earlier !== undefined)
        problems.push({ code: 'entranceCellShared', item, cell, otherId: earlier })
      else owner.set(key, entrance.id)
    }
  })

  return problems
}

/** The feature or entrance a problem points to, for selecting it in the editor. */
export function problemTarget(
  problem: LayoutProblem,
): { kind: 'feature' | 'entrance'; id: string } | null {
  const { item } = problem
  return item.kind === 'feature' || item.kind === 'entrance'
    ? { kind: item.kind, id: item.id }
    : null
}
